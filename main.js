import { db } from "./firebase-init.js";
import {
  collection, onSnapshot, getDocs, doc, writeBatch,
  query, where, limit, orderBy
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// ==================== CONFIGURACIÓN DE CLOUDINARY ====================
const CLOUD_NAME = "kjfgogu5";
const UPLOAD_PRESET = "orquestas_unsigned";

// ==================== CARRUSEL (IIFE con Cloudinary) ====================
(function () {
  const carruselCol = collection(db, "carrusel");
  let carouselData = [], currentIndex = 0, autoInterval;

  function renderizarCarrusel(imagenes) {
    carouselData = imagenes;
    const imgEl = document.getElementById("carousel-image");
    const tituloEl = document.getElementById("carousel-title");
    const descEl = document.getElementById("carousel-desc");
    if (!carouselData.length) {
      if (imgEl) imgEl.src = "";
      if (tituloEl) tituloEl.textContent = "Sin imágenes";
      if (descEl) descEl.textContent = "El carrusel está vacío.";
      return;
    }
    if (currentIndex >= carouselData.length) currentIndex = 0;
    const item = carouselData[currentIndex];
    if (imgEl) { imgEl.src = item.url || ""; imgEl.alt = item.alt || ""; }
    if (tituloEl) tituloEl.textContent = item.alt || "Sin título";
    if (descEl) descEl.textContent = item.text || "";
  }

  function siguienteSlide() { if (carouselData.length) { currentIndex = (currentIndex + 1) % carouselData.length; renderizarCarrusel(carouselData); } }
  function anteriorSlide() { if (carouselData.length) { currentIndex = (currentIndex - 1 + carouselData.length) % carouselData.length; renderizarCarrusel(carouselData); } }
  function autoRotacionStart() { clearInterval(autoInterval); autoInterval = setInterval(siguienteSlide, 4000); }
  function autoRotacionStop() { clearInterval(autoInterval); }

  // Subir a Cloudinary
  async function subirACloudinary(blob, carpeta = "carrusel") {
    const fd = new FormData(); fd.append("file", blob); fd.append("upload_preset", UPLOAD_PRESET); fd.append("folder", carpeta);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Error al subir");
    const data = await res.json();
    return data.secure_url;
  }

  // Migración inicial de localStorage
  async function migrarSiExiste() {
    const old = localStorage.getItem("sistemaOrquestas_carousel");
    if (!old) return;
    let datos; try { datos = JSON.parse(old); } catch { return; }
    if (!Array.isArray(datos) || !datos.length) return;
    const snap = await getDocs(carruselCol);
    if (!snap.empty) { localStorage.removeItem("sistemaOrquestas_carousel"); return; }
    const batch = writeBatch(db);
    for (let i = 0; i < datos.length; i++) {
      const item = datos[i]; let url = item.src || "";
      if (url.startsWith("data:")) { const blob = await (await fetch(url)).blob(); url = await subirACloudinary(blob, "carrusel"); }
      batch.set(doc(carruselCol), { url, alt: item.alt || "", text: item.text || "", orden: i });
    }
    await batch.commit();
    localStorage.removeItem("sistemaOrquestas_carousel");
  }

  // Guardar cambios
  async function guardarFirestore(nuevos) {
    const snap = await getDocs(carruselCol);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(doc(db, "carrusel", d.id)));
    nuevos.forEach((item, i) => batch.set(doc(carruselCol), { url: item.url, alt: item.alt || "", text: item.text || "", orden: i }));
    await batch.commit();
  }

  // ==================== EDITOR DE IMAGEN (Recortar / Rotar / Saturar) ====================
  let editorCallback = null;

  function crearCropModal() {
    if (document.getElementById("crop-modal")) return;
    const div = document.createElement("div");
    div.id = "crop-modal";
    div.className = "modal-overlay crop-modal";
    div.innerHTML = `
      <div class="modal-content crop-content">
        <button class="modal-close-btn" id="crop-close-btn">&times;</button>
        <h2>Editor de Imagen</h2>
        <div class="editor-tools">
          <button type="button" class="tool-btn active" data-tool="recortar"><i class="fa-solid fa-crop"></i> Recortar</button>
          <button type="button" class="tool-btn" data-tool="rotar"><i class="fa-solid fa-rotate"></i> Rotar</button>
          <button type="button" class="tool-btn" data-tool="saturar"><i class="fa-solid fa-droplet"></i> Saturar</button>
        </div>
        <div class="crop-container">
          <img id="crop-source"/>
          <div id="crop-area" class="crop-area"><div class="resize-handle"></div></div>
        </div>
        <div class="tool-panel" id="panel-rotar" style="display:none;">
          <button type="button" id="rotar-btn" class="btn btn-submit"><i class="fa-solid fa-rotate-right"></i> Rotar 90°</button>
        </div>
        <div class="tool-panel" id="panel-saturar" style="display:none;">
          <label for="sat-range">Saturación: <span id="sat-value">100</span>%</label>
          <input type="range" id="sat-range" min="0" max="200" value="100"/>
        </div>
        <canvas id="crop-canvas" style="display:none;"></canvas>
        <div class="crop-buttons">
          <button id="crop-confirm" class="btn btn-submit">Aplicar y usar</button>
          <button id="crop-cancel" class="btn btn-cerrar">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(div);

    // Cambiar de herramienta (solo cambia qué panel se ve; todo se aplica junto al confirmar)
    div.querySelectorAll(".tool-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        div.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        div.querySelectorAll(".tool-panel").forEach(p => p.style.display = "none");
        const panel = document.getElementById(`panel-${btn.dataset.tool}`);
        if (panel) panel.style.display = "block";
      });
    });

    // Saturación: previsualización en vivo con filtro CSS
    const satRange = document.getElementById("sat-range");
    const satValue = document.getElementById("sat-value");
    satRange.addEventListener("input", () => {
      satValue.textContent = satRange.value;
      document.getElementById("crop-source").style.filter = `saturate(${satRange.value}%)`;
    });

    // Rotar: rota los píxeles reales de la imagen (no solo la vista) y reinicia el recorte
    document.getElementById("rotar-btn").addEventListener("click", () => {
      const img = document.getElementById("crop-source");
      const tmp = document.createElement("canvas");
      const w = img.naturalWidth, h = img.naturalHeight;
      tmp.width = h; tmp.height = w;
      const ctx = tmp.getContext("2d");
      ctx.translate(h / 2, w / 2);
      ctx.rotate(90 * Math.PI / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      img.src = tmp.toDataURL("image/jpeg", 0.92); // dispara onload y reinicia el área de recorte
    });
  }

  function inicializarAreaDeRecorte() {
    const img = document.getElementById("crop-source");
    let area = document.getElementById("crop-area");
    const dW = img.width, dH = img.height;
    let cW = Math.min(dW, dH * 16 / 9), cH = cW * 9 / 16, cX = (dW - cW) / 2, cY = (dH - cH) / 2;
    const upd = () => { area.style.left = cX + "px"; area.style.top = cY + "px"; area.style.width = cW + "px"; area.style.height = cH + "px"; };

    // Clonamos el área para eliminar listeners de una rotación/carga anterior
    const nuevaArea = area.cloneNode(true);
    area.parentNode.replaceChild(nuevaArea, area);
    area = nuevaArea;
    const handle = area.querySelector(".resize-handle");
    upd();

    let dragging = false, sx, sy, sl, st, sw;
    const down = (ev) => { ev.preventDefault(); dragging = true; sx = ev.clientX; sy = ev.clientY; sl = cX; st = cY; sw = cW; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); };
    const move = (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (ev.target === handle) {
        let nW = sw + dx;
        if (nW < 50) nW = 50;
        if (cX + nW > dW) nW = dW - cX;
        if (cY + nW * 9 / 16 > dH) nW = (dH - cY) * 16 / 9;
        cW = nW; cH = cW * 9 / 16;
      } else {
        cX = Math.max(0, Math.min(sl + dx, dW - cW));
        cY = Math.max(0, Math.min(st + dy, dH - cH));
      }
      upd();
    };
    const up = () => { dragging = false; document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
    area.addEventListener("pointerdown", down);
    handle.addEventListener("pointerdown", down);

    // Guardamos los valores actuales para leerlos al confirmar
    area._getCropBox = () => ({ cX, cY, cW, cH, dW, dH });
  }

  function abrirEditorImagen(file, cb) {
    editorCallback = cb;
    const modal = document.getElementById("crop-modal");
    const img = document.getElementById("crop-source");
    const confirmBtn = document.getElementById("crop-confirm");
    const origText = confirmBtn.textContent;

    // Reset de herramientas y estado visual
    modal.querySelectorAll(".tool-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
    modal.querySelectorAll(".tool-panel").forEach(p => p.style.display = "none");
    const satRange = document.getElementById("sat-range");
    satRange.value = 100;
    document.getElementById("sat-value").textContent = "100";
    img.style.filter = "saturate(100%)";

    img.onload = () => { inicializarAreaDeRecorte(); };

    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true; confirmBtn.textContent = "⏳ Subiendo...";
      try {
        const area = document.getElementById("crop-area");
        const box = area._getCropBox ? area._getCropBox() : null;
        const canvas = document.getElementById("crop-canvas");
        const ctx = canvas.getContext("2d");
        const escala = img.naturalWidth / img.width;
        const finalW = 960, finalH = 540; // 16:9
        canvas.width = finalW; canvas.height = finalH;
        ctx.filter = `saturate(${satRange.value}%)`;
        if (box) {
          ctx.drawImage(img, box.cX * escala, box.cY * escala, box.cW * escala, box.cH * escala, 0, 0, finalW, finalH);
        } else {
          ctx.drawImage(img, 0, 0, finalW, finalH);
        }
        const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
        if (!blob) throw new Error("No se pudo generar la imagen");
        const url = await subirACloudinary(blob, "carrusel");
        modal.style.display = "none";
        editorCallback(url);
      } catch (err) {
        console.error(err);
        window._showToast?.("No se pudo procesar la imagen", "error");
        editorCallback(null);
      } finally {
        confirmBtn.disabled = false; confirmBtn.textContent = origText;
      }
    };
    document.getElementById("crop-cancel").onclick = () => { modal.style.display = "none"; editorCallback(null); };
    document.getElementById("crop-close-btn").onclick = () => { modal.style.display = "none"; editorCallback(null); };

    modal.style.display = "flex";
  }

  // ==================== MENÚ "GESTIÓN DEL CARRUSEL" (galería con miniaturas) ====================
  let modalReady = false;
  let working = [];
  let seleccionActual = 0;

  function initCarouselModal() {
    if (modalReady) return; modalReady = true;

    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content premium-modal carousel-manager">
        <button class="modal-close-btn" id="carousel-close-btn">&times;</button>
        <h2><i class="fa-solid fa-images"></i> Gestión del Carrusel</h2>

        <div id="carousel-empty-state" class="drop-zone">
          <p>🎵 Ingrese una imagen para comenzar</p>
          <p style="font-size:0.8rem;color:#888;">Arrastra un archivo o haz clic aquí</p>
        </div>

        <div id="carousel-editor-body" style="display:none;">
          <div class="preview-grande">
            <img id="preview-img" src="" alt="Vista previa"/>
          </div>
          <div class="editor-row">
            <label>Título:</label>
            <input type="text" id="preview-titulo" class="form-control" placeholder="Título de la imagen"/>
          </div>
          <div class="editor-row">
            <label>Texto:</label>
            <input type="text" id="preview-texto" class="form-control" placeholder="Texto descriptivo"/>
          </div>
          <div class="editor-row acciones-item">
            <button type="button" id="btn-editar-img" class="btn btn-submit"><i class="fa-solid fa-pen"></i> Editar</button>
            <button type="button" id="btn-eliminar-img" class="btn btn-cerrar"><i class="fa-solid fa-trash"></i> Eliminar</button>
          </div>
        </div>

        <input type="file" id="carousel-file-input" accept="image/*" style="display:none;"/>
        <div class="thumb-strip" id="thumb-strip"></div>

        <div class="crop-buttons">
          <button id="save-carousel-btn" class="btn btn-submit">Guardar Cambios</button>
          <button id="close-modal" class="btn btn-cerrar">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    crearCropModal();

    const fileInput = document.getElementById("carousel-file-input");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) abrirEditorImagen(file, url => { if (url) window._agregarImagenAlCarrusel(url); });
      e.target.value = "";
    });

    function renderThumbs() {
      const strip = document.getElementById("thumb-strip");
      strip.innerHTML = "";
      working.forEach((item, idx) => {
        const t = document.createElement("div");
        t.className = "thumb" + (idx === seleccionActual ? " selected" : "");
        t.innerHTML = item.url ? `<img src="${item.url}" alt=""/>` : `<div class="thumb-vacio"><i class="fa-solid fa-image"></i></div>`;
        t.addEventListener("click", () => { seleccionActual = idx; renderTodo(); });
        strip.appendChild(t);
      });
      const addBtn = document.createElement("div");
      addBtn.className = "thumb thumb-add";
      addBtn.innerHTML = `<i class="fa-solid fa-plus"></i>`;
      addBtn.addEventListener("click", () => fileInput.click());
      strip.appendChild(addBtn);
    }

    function sync() {
      if (!working[seleccionActual]) return;
      working[seleccionActual].alt = document.getElementById("preview-titulo").value;
      working[seleccionActual].text = document.getElementById("preview-texto").value;
    }

    function renderTodo() {
      const empty = document.getElementById("carousel-empty-state");
      const body = document.getElementById("carousel-editor-body");
      if (!working.length) {
        empty.style.display = "block";
        body.style.display = "none";
      } else {
        empty.style.display = "none";
        body.style.display = "block";
        if (seleccionActual >= working.length) seleccionActual = working.length - 1;
        const item = working[seleccionActual];
        document.getElementById("preview-img").src = item.url || "";
        document.getElementById("preview-titulo").value = item.alt || "";
        document.getElementById("preview-texto").value = item.text || "";
      }
      renderThumbs();
    }

    ["dragenter", "dragover", "dragleave", "drop"].forEach(ev =>
      document.getElementById("carousel-empty-state").addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
    );
    document.getElementById("carousel-empty-state").addEventListener("dragenter", () => document.getElementById("carousel-empty-state").classList.add("active"));
    document.getElementById("carousel-empty-state").addEventListener("dragleave", () => document.getElementById("carousel-empty-state").classList.remove("active"));
    document.getElementById("carousel-empty-state").addEventListener("drop", e => {
      document.getElementById("carousel-empty-state").classList.remove("active");
      const files = e.dataTransfer.files;
      if (files.length) abrirEditorImagen(files[0], url => { if (url) window._agregarImagenAlCarrusel(url); });
    });
    document.getElementById("carousel-empty-state").addEventListener("click", () => fileInput.click());

    document.getElementById("preview-titulo").addEventListener("input", sync);
    document.getElementById("preview-texto").addEventListener("input", sync);

    document.getElementById("btn-editar-img").addEventListener("click", () => {
      const item = working[seleccionActual];
      if (!item || !item.url) return;
      fetch(item.url).then(r => r.blob()).then(blob => {
        const file = new File([blob], "imagen.jpg", { type: blob.type || "image/jpeg" });
        abrirEditorImagen(file, url => { if (url) { working[seleccionActual].url = url; renderTodo(); } });
      });
    });

    document.getElementById("btn-eliminar-img").addEventListener("click", () => {
      working.splice(seleccionActual, 1);
      seleccionActual = Math.max(0, seleccionActual - 1);
      renderTodo();
    });

    window._agregarImagenAlCarrusel = (url) => {
      sync();
      working.push({ url, alt: "", text: "" });
      seleccionActual = working.length - 1;
      renderTodo();
    };

    document.getElementById("save-carousel-btn").onclick = async () => {
      sync();
      await guardarFirestore(working);
      modal.style.display = "none";
    };
    document.getElementById("close-modal").onclick = () => { working = carouselData.map(i => ({ ...i })); modal.style.display = "none"; };
    document.getElementById("carousel-close-btn").onclick = () => { working = carouselData.map(i => ({ ...i })); modal.style.display = "none"; };

    window.showCarouselModal = () => {
      working = carouselData.map(item => ({ ...item }));
      seleccionActual = 0;
      renderTodo();
      modal.style.display = "flex";
    };
  }

  // Inicialización del carrusel
  (async function iniciarCarrusel() {
    await migrarSiExiste();
    onSnapshot(carruselCol, snap => {
      const imagenes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.orden - b.orden);
      renderizarCarrusel(imagenes);
    });
    document.getElementById("prev-slide")?.addEventListener("click", () => { anteriorSlide(); autoRotacionStop(); autoRotacionStart(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { siguienteSlide(); autoRotacionStop(); autoRotacionStart(); });
    autoRotacionStart();
    if (window.Auth?.checkPermission && window.Auth.checkPermission("edit_carousel")) {
      initCarouselModal();
      document.getElementById("carousel-container")?.insertAdjacentHTML(
        "beforeend",
        `<button class="carousel-edit-btn" id="btn-abrir-gestor-carrusel" title="Gestionar carrusel"><i class="fa-solid fa-pen"></i></button>`
      );
      document.getElementById("btn-abrir-gestor-carrusel")?.addEventListener("click", () => window.showCarouselModal());
    }
    window.UI?.render(); // opcional
  })();
})();

// ==================== DASHBOARD: MÉTRICAS Y RESUMEN ====================
async function cargarMetricasYResumen() {
  try {
    const miembrosSnap = await getDocs(collection(db, "usuarios"));
    document.getElementById("metric-miembros").textContent = miembrosSnap.size;

    const partiturasSnap = await getDocs(collection(db, "partituras"));
    document.getElementById("metric-partituras").textContent = partiturasSnap.size;

    const agrupacionesSnap = await getDocs(collection(db, "agrupaciones"));
    document.getElementById("metric-agrupaciones").textContent = agrupacionesSnap.size;

    const tbody = document.getElementById("tabla-resumen-body");
    if (!tbody) return;
    const q = query(collection(db, "usuarios"), limit(5));
    const snap = await getDocs(q);
    if (!snap.empty) {
      tbody.innerHTML = "";
      snap.forEach(d => {
        const data = d.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${data.nombre || data.email || "Sin Nombre"}</td>
          <td><span style="color:var(--color-primario);font-weight:500;">${data.rango || "Miembro"}</span></td>
          <td>${data.nucleo || data.estado || "N/A"}</td>
          <td>${data.fechaCreacion ? new Date(data.fechaCreacion).toLocaleDateString() : "—"}</td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center">No hay registros recientes.</td></tr>`;
    }
  } catch (err) {
    console.error("Error cargando métricas:", err);
    const tbody = document.getElementById("tabla-resumen-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--color-acento);">Error de conexión o permisos.</td></tr>`;
  }
}

// ==================== EVENTO DE AUTENTICACIÓN ====================
window.addEventListener("auth-ready", (e) => {
  const session = e.detail;
  const display = document.getElementById("user-email-display");
  if (display) {
    display.textContent = session ? (session.email || "Usuario Conectado") : "Invitado";
  }
  cargarMetricasYResumen();
});

if (window.Auth?.getSession()) {
  cargarMetricasYResumen();
}

document.getElementById("btn-logout")?.addEventListener("click", () => window.Auth?.logout());
