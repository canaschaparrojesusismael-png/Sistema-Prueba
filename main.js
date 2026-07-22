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

  // Modal crop (con estado de carga)
  let cropCallback = null;
  function abrirCrop(file, cb) {
    cropCallback = cb;
    const modal = document.getElementById("crop-modal"), img = document.getElementById("crop-source"),
          canvas = document.getElementById("crop-canvas"), ctx = canvas.getContext("2d"),
          confirmBtn = document.getElementById("crop-confirm"), origText = confirmBtn.textContent;
    const reader = new FileReader();
    reader.onload = e => {
      img.src = e.target.result;
      img.onload = () => {
        const area = document.getElementById("crop-area"),
              nW = img.naturalWidth, nH = img.naturalHeight,
              dW = img.width, dH = img.height;
        let cW = Math.min(dW, dH * 16/9), cH = cW * 9/16, cX = (dW - cW)/2, cY = (dH - cH)/2;
        const upd = () => { area.style.left = cX+"px"; area.style.top = cY+"px"; area.style.width = cW+"px"; area.style.height = cH+"px"; };
        upd();
        let dragging = false, sx, sy, sl, st, sw, sh;
        const handle = area.querySelector(".resize-handle");
        const down = (ev) => { ev.preventDefault(); dragging = true; sx = ev.clientX; sy = ev.clientY; sl = cX; st = cY; sw = cW; sh = cH; document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); };
        const move = (ev) => { if (!dragging) return; const dx = ev.clientX - sx, dy = ev.clientY - sy; if (ev.target === handle) { let nW = sw + dx; if (nW < 50) nW = 50; if (cX + nW > dW) nW = dW - cX; if (cY + nW*9/16 > dH) nW = (dH - cY) * 16/9; cW = nW; cH = cW * 9/16; } else { cX = Math.max(0, Math.min(sl + dx, dW - cW)); cY = Math.max(0, Math.min(st + dy, dH - cH)); } upd(); };
        const up = () => { dragging = false; document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
        area.addEventListener("pointerdown", down); handle.addEventListener("pointerdown", down);
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true; confirmBtn.textContent = "⏳ Subiendo...";
          try {
            const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.7));
            if (!blob) throw new Error("No se pudo generar");
            const url = await subirACloudinary(blob, "carrusel");
            modal.style.display = "none"; cropCallback(url);
          } catch (err) { console.error(err); cropCallback(null); }
          finally { confirmBtn.disabled = false; confirmBtn.textContent = origText; }
        };
        document.getElementById("crop-cancel").onclick = () => { modal.style.display = "none"; cropCallback(null); };
        document.getElementById("crop-close-btn").onclick = () => { modal.style.display = "none"; cropCallback(null); };
        modal.style.display = "flex";
      };
    };
    reader.readAsDataURL(file);
  }

  // Crear modales
  function crearCropModal() {
    if (document.getElementById("crop-modal")) return;
    const div = document.createElement("div"); div.id = "crop-modal"; div.className = "modal-overlay crop-modal";
    div.innerHTML = `<div class="modal-content crop-content"><button class="modal-close-btn" id="crop-close-btn">&times;</button><h2>Recortar imagen</h2><div class="crop-container"><img id="crop-source"/><div id="crop-area" class="crop-area"><div class="resize-handle"></div></div></div><canvas id="crop-canvas" style="display:none;"></canvas><div class="crop-buttons"><button id="crop-confirm" class="btn btn-submit">Recortar</button><button id="crop-cancel" class="btn btn-cerrar">Cancelar</button></div></div>`;
    document.body.appendChild(div);
  }

  function initDragDrop() {
    const drop = document.getElementById("drop-zone"), fileInp = document.querySelector("#carousel-items .img-file");
    if (!drop) return;
    ["dragenter","dragover","dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
    ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, () => drop.classList.add("active")));
    ["dragleave","drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("active")));
    drop.addEventListener("drop", e => { const files = e.dataTransfer.files; if (files.length) abrirCrop(files[0], url => { if (url) { const inp = document.querySelector("#carousel-items .img-url"); if (inp) inp.value = url; } }); });
    drop.addEventListener("click", () => { if (fileInp) fileInp.click(); });
  }

  let modalReady = false;
  function initCarouselModal() {
    if (modalReady) return; modalReady = true;
    const modal = document.createElement("div"); modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal-content premium-modal"><button class="modal-close-btn" id="carousel-close-btn">&times;</button><h2>Gestión del Carrusel</h2><div class="drop-zone" id="drop-zone"><p>🎵 Arrastra una imagen aquí</p><p style="font-size:0.8rem;color:#888;">o haz clic para seleccionar</p></div><div id="carousel-items"></div><button id="add-image-btn" class="btn btn-submit">Agregar Imagen</button><button id="save-carousel-btn" class="btn btn-submit" style="background:var(--color-primario);">Guardar Cambios</button><button id="close-modal" class="btn btn-cerrar">Cerrar</button></div>`;
    document.body.appendChild(modal);
    crearCropModal(); initDragDrop();
    let working = [...carouselData];
    function renderItems() {
      const cont = document.getElementById("carousel-items"); cont.innerHTML = "";
      working.forEach((item, idx) => {
        const div = document.createElement("div"); div.className = "carousel-item-editor";
        div.innerHTML = `<div class="editor-row"><label>URL:</label><input type="text" class="img-url form-control" value="${item.url||""}" data-index="${idx}"/><span>o archivo</span><input type="file" class="img-file form-control" accept="image/*" data-index="${idx}"/></div><div class="editor-row"><label>Título:</label><input type="text" class="img-alt form-control" value="${item.alt||""}"/></div><div class="editor-row"><label>Texto:</label><input type="text" class="img-text form-control" value="${item.text||""}"/></div><button class="btn btn-cerrar eliminar-item" data-index="${idx}">Eliminar</button>`;
        cont.appendChild(div);
      });
      cont.querySelectorAll(".img-file").forEach(inp => inp.addEventListener("change", function(e) {
        const idx = +this.dataset.index, file = e.target.files[0];
        if (!file) return;
        abrirCrop(file, url => { if (url) { const urlInp = cont.querySelector(`.img-url[data-index="${idx}"]`) || cont.querySelectorAll(".img-url")[idx]; if (urlInp) urlInp.value = url; if (working[idx]) working[idx].url = url; } e.target.value = ""; });
      }));
      cont.querySelectorAll(".eliminar-item").forEach(btn => btn.addEventListener("click", () => { sync(); working.splice(+btn.dataset.index, 1); renderItems(); }));
    }
    function sync() { working = [...document.querySelectorAll(".carousel-item-editor")].map(f => ({ url: f.querySelector(".img-url")?.value||"", alt: f.querySelector(".img-alt")?.value||"", text: f.querySelector(".img-text")?.value||"" })); }
    document.getElementById("add-image-btn").onclick = () => { sync(); working.push({ url:"", alt:"", text:"" }); renderItems(); };
    document.getElementById("save-carousel-btn").onclick = async () => { sync(); await guardarFirestore(working); modal.style.display = "none"; };
    document.getElementById("close-modal").onclick = () => { working = [...carouselData]; modal.style.display = "none"; };
    document.getElementById("carousel-close-btn").onclick = () => { working = [...carouselData]; modal.style.display = "none"; };
    window.showCarouselModal = () => { working = carouselData.map(item=>({...item})); renderItems(); modal.style.display = "flex"; };
  }

  // Inicialización del carrusel
  (async function iniciarCarrusel() {
    await migrarSiExiste();
    onSnapshot(carruselCol, snap => {
      const imagenes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.orden - b.orden);
      renderizarCarrusel(imagenes);
    });
    document.getElementById("prev-slide")?.addEventListener("click", () => { anteriorSlide(); autoRotacionStop(); autoRotacionStart(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { siguienteSlide(); autoRotacionStop(); autoRotacionStart(); });
    autoRotacionStart();
    if (window.Auth?.checkPermission && window.Auth.checkPermission("edit_carousel")) initCarouselModal();
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
  if (session && display) {
    display.textContent = session.email || "Usuario Conectado";
  }
  // Cargar métricas cuando la sesión esté lista
  cargarMetricasYResumen();
});

// También cargamos métricas si la sesión ya estaba disponible antes del evento
if (window.Auth?.getSession()) {
  cargarMetricasYResumen();
}

// Configurar botón de logout
document.getElementById("btn-logout")?.addEventListener("click", () => window.Auth?.logout());
