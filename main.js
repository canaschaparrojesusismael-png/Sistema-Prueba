import { db } from "./firebase-init.js";
import {
  collection, onSnapshot, getDocs, doc, writeBatch,
  query, where, limit, orderBy
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { subirACloudinary, abrirEditorImagen } from "./gestor-imagenes.js";

// ==================== CARRUSEL ====================
// El editor de imagen (recortar/rotar/saturar) y la subida a Cloudinary ya
// no viven acá — se movieron a gestor-imagenes.js para poder compartirlos
// con Flyers en panel.html, en vez de tener el mismo código duplicado dos
// veces con distinta calidad.
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

    const OPCIONES_EDITOR = { carpeta: "carrusel", aspecto: 16 / 9, ancho: 960, alto: 540 };

    const fileInput = document.getElementById("carousel-file-input");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) abrirEditorImagen(file, OPCIONES_EDITOR, url => { if (url) window._agregarImagenAlCarrusel(url); });
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
      const strip = document.getElementById("thumb-strip");
      if (!working.length) {
        // Sin imágenes: SOLO la caja grande de "Ingrese una imagen para comenzar".
        // La tira de miniaturas (con el "+") se oculta por completo para no duplicar
        // el punto de entrada.
        empty.style.display = "block";
        body.style.display = "none";
        strip.style.display = "none";
        strip.innerHTML = "";
        return;
      }
      // Con al menos 1 imagen: SOLO la tira de miniaturas (con su "+" al final).
      empty.style.display = "none";
      body.style.display = "block";
      strip.style.display = "flex";
      if (seleccionActual >= working.length) seleccionActual = working.length - 1;
      const item = working[seleccionActual];
      document.getElementById("preview-img").src = item.url || "";
      document.getElementById("preview-titulo").value = item.alt || "";
      document.getElementById("preview-texto").value = item.text || "";
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
      if (files.length) abrirEditorImagen(files[0], OPCIONES_EDITOR, url => { if (url) window._agregarImagenAlCarrusel(url); });
    });
    document.getElementById("carousel-empty-state").addEventListener("click", () => fileInput.click());

    document.getElementById("preview-titulo").addEventListener("input", sync);
    document.getElementById("preview-texto").addEventListener("input", sync);

    document.getElementById("btn-editar-img").addEventListener("click", () => {
      const item = working[seleccionActual];
      if (!item || !item.url) return;
      fetch(item.url).then(r => r.blob()).then(blob => {
        const file = new File([blob], "imagen.jpg", { type: blob.type || "image/jpeg" });
        abrirEditorImagen(file, OPCIONES_EDITOR, url => { if (url) { working[seleccionActual].url = url; renderTodo(); } });
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

    const saveBtn = document.getElementById("save-carousel-btn");
    const saveBtnTextoOriginal = saveBtn.textContent;
    saveBtn.onclick = async () => {
      sync();
      saveBtn.disabled = true;
      saveBtn.textContent = "Guardando...";
      try {
        await guardarFirestore(working);
        // No hace falta re-pintar el carrusel público a mano: el onSnapshot()
        // de iniciarCarrusel() está escuchando la colección "carrusel" y se
        // dispara solo apenas Firestore confirma este guardado.
        window._showToast?.("Cambios guardados correctamente", "success");
        modal.style.display = "none";
      } catch (err) {
        console.error("Error al guardar los cambios del carrusel:", err);
        window._showToast?.("No se pudieron guardar los cambios. Mirá la consola (F12) para más detalle.", "error");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = saveBtnTextoOriginal;
      }
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
    // Antes, si migrarSiExiste() fallaba (permisos, red, Cloudinary, etc.)
    // toda la función se cortaba y el botón de editar quedaba "muerto"
    // (aparecía en pantalla pero no hacía nada al tocarlo). Ahora un fallo
    // acá solo se registra en consola y el resto sigue funcionando igual.
    try {
      await migrarSiExiste();
    } catch (err) {
      console.error("No se pudo migrar el carrusel viejo (se continúa igual):", err);
    }

    try {
      onSnapshot(carruselCol, snap => {
        const imagenes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.orden - b.orden);
        renderizarCarrusel(imagenes);
      }, err => {
        console.error("No se pudo leer el carrusel desde Firestore:", err);
        window._showToast?.("No se pudo cargar el carrusel (revisá permisos/consola)", "error");
      });
    } catch (err) {
      console.error("Error al suscribirse al carrusel:", err);
    }

    document.getElementById("prev-slide")?.addEventListener("click", () => { anteriorSlide(); autoRotacionStop(); autoRotacionStart(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { siguienteSlide(); autoRotacionStop(); autoRotacionStart(); });
    autoRotacionStart();

    // El carrusel de index.html es el carrusel NACIONAL: solo Owner Supremo y
    // Director Nacional pueden modificarlo. (El botón visual lo crea ui-manager.js;
    // aquí solo dejamos lista la función que ese botón invoca.)
    try {
      const rol = window.Auth?.getSession()?.role;
      if (["owner_supremo", "director_nacional"].includes(rol)) {
        initCarouselModal();
      }
    } catch (err) {
      console.error("Error al inicializar el gestor del carrusel:", err);
    }

    window.UI?.render(); // vuelve a pintar la barra de navegación para que muestre (o no) el botón de editar
  })();
})();

// ==================== DASHBOARD: MÉTRICAS Y RESUMEN ====================
async function cargarMetricasYResumen() {
  // Esta función es para el futuro panel administrativo; si la página actual
  // no tiene el dashboard de métricas (como el index.html público), no hace nada.
  if (!document.getElementById("metric-miembros")) return;
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
// ==================== EVENTO DE AUTENTICACIÓN ====================
window.addEventListener("auth-ready", (e) => {
  const session = e.detail;
  const display = document.getElementById("user-email-display");
  if (display) {
    display.textContent = session ? (session.email || "Usuario Conectado") : "Invitado";
  }
  
  // ESTA ES LA LÍNEA CRÍTICA QUE FALTABA
  if (window.UI) window.UI.render(); 
  
  cargarMetricasYResumen();
});

if (window.Auth?.getSession()) {
  cargarMetricasYResumen();
  // También asegúrate de renderizar si por alguna razón la sesión ya existía rápido
  if (window.UI) window.UI.render(); 
}

document.getElementById("btn-logout")?.addEventListener("click", () => window.Auth?.logout());
