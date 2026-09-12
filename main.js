import { db } from "./firebase-init.js";
import {
  collection, onSnapshot, getDocs, doc, writeBatch, setDoc,
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
  // v3.1: antes, si se abría el editor del carrusel justo antes de que
  // llegara la primera respuesta de Firestore, "working" (más abajo) se
  // copiaba de un "carouselData" todavía vacío y se quedaba así para
  // siempre — el carrusel público sí se actualizaba, pero el editor no.
  // Esta bandera distingue "todavía no llegó nada" de "llegó y está vacío".
  let carouselCargado = false;

  // v3.0 (P-11): precarga la SIGUIENTE imagen del carrusel un paso antes de
  // que le toque mostrarse, para que la rotación automática no tenga ni un
  // parpadeo mientras el navegador todavía está bajando la imagen.
  function precargarSiguiente() {
    if (carouselData.length < 2) return;
    const siguiente = carouselData[(currentIndex + 1) % carouselData.length];
    if (siguiente?.url) { const pre = new Image(); pre.src = siguiente.url; }
  }

  // v3.0 (G-08): puntos de POSICIÓN (distintos de los de carga) para saber
  // cuántas imágenes hay y cuál se está viendo, navegables con un clic.
  function renderPosicionDots() {
    const cont = document.getElementById("carousel-posicion");
    if (!cont) return;
    if (carouselData.length < 2) { cont.innerHTML = ""; return; }
    cont.innerHTML = "";
    carouselData.forEach((_, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = idx === currentIndex ? "activo" : "";
      b.setAttribute("aria-label", `Ir a la imagen ${idx + 1} de ${carouselData.length}`);
      b.addEventListener("click", () => { currentIndex = idx; renderizarCarrusel(carouselData); autoRotacionStop(); autoRotacionStart(); });
      cont.appendChild(b);
    });
  }

  function renderizarCarrusel(imagenes) {
    carouselData = imagenes;
    if (!carouselCargado) {
      carouselCargado = true;
      if (modalEsperandoCarga) {
        // El editor se abrió antes de esta primera respuesta y quedó
        // esperando (ver showCarouselModal): ahora sí hay datos reales,
        // así que lo completamos sin que el usuario tenga que cerrar y
        // volver a abrir el modal.
        modalEsperandoCarga = false;
        working = imagenes.map(item => ({ ...item }));
        renderTodoRef?.();
      }
    }
    const imgEl = document.getElementById("carousel-image");
    const tituloEl = document.getElementById("carousel-title");
    const descEl = document.getElementById("carousel-desc");
    const contadorEl = document.getElementById("carousel-contador");
    // AGREGADO 2026-09-06/07: apenas hay un dato REAL (aunque sea "está
    // vacío"), se ocultan los DOS indicadores de carga (imagen y texto) —
    // antes solo había uno, y encima la persona veía el escudo del colegio
    // (images.jpg) de relleno en vez de un estado de carga neutro.
    document.getElementById("carousel-loader")?.style.setProperty("display", "none");
    document.getElementById("carousel-loader-texto")?.style.setProperty("display", "none");
    if (!carouselData.length) {
      if (imgEl) imgEl.src = "";
      if (tituloEl) tituloEl.textContent = "Sin imágenes";
      if (descEl) descEl.textContent = "El carrusel está vacío.";
      if (contadorEl) contadorEl.textContent = "";
      renderPosicionDots();
      return;
    }
    if (currentIndex >= carouselData.length) currentIndex = 0;
    const item = carouselData[currentIndex];
    if (imgEl) { imgEl.src = item.url || ""; imgEl.alt = item.alt || ""; }
    if (tituloEl) tituloEl.textContent = item.alt || "Sin título";
    if (descEl) descEl.textContent = item.text || "";
    if (contadorEl) contadorEl.textContent = carouselData.length > 1 ? `${currentIndex + 1} / ${carouselData.length}` : "";
    renderPosicionDots();
    precargarSiguiente();
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
  let modalEsperandoCarga = false;
  let renderTodoRef = null;

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
            <input type="text" id="preview-titulo" class="form-control" placeholder="Título de la imagen" maxlength="80"/>
            <small class="contador-caracteres" id="contador-titulo">0/80</small>
          </div>
          <div class="editor-row">
            <label>Texto:</label>
            <input type="text" id="preview-texto" class="form-control" placeholder="Texto descriptivo" maxlength="200"/>
            <small class="contador-caracteres" id="contador-texto">0/200</small>
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
      actualizarContadores();
    }
    // v3.0 (P-13): contador de caracteres restantes visible en vivo.
    function actualizarContadores() {
      const t = document.getElementById("preview-titulo"), d = document.getElementById("preview-texto");
      const ct = document.getElementById("contador-titulo"), cd = document.getElementById("contador-texto");
      if (t && ct) ct.textContent = `${t.value.length}/${t.maxLength}`;
      if (d && cd) cd.textContent = `${d.value.length}/${d.maxLength}`;
    }

    function renderTodo() {
      const empty = document.getElementById("carousel-empty-state");
      const body = document.getElementById("carousel-editor-body");
      const strip = document.getElementById("thumb-strip");
      const saveBtnEl = document.getElementById("save-carousel-btn");
      if (modalEsperandoCarga) {
        // Todavía no sabemos qué hay: mostramos carga, no "vacío", y
        // bloqueamos Guardar para no pisar el carrusel real con nada.
        empty.style.display = "block";
        empty.innerHTML = `<div style="display:flex;justify-content:center;padding:1rem 0;">${window._loaderPuntosHTML ? window._loaderPuntosHTML(true, true) : "Cargando…"}</div><p style="font-size:0.85rem;color:#888;text-align:center;">Cargando el carrusel actual…</p>`;
        body.style.display = "none";
        strip.style.display = "none";
        strip.innerHTML = "";
        if (saveBtnEl) saveBtnEl.disabled = true;
        return;
      }
      if (saveBtnEl) saveBtnEl.disabled = false;
      if (!working.length) {
        // Sin imágenes: SOLO la caja grande de "Ingrese una imagen para comenzar".
        // La tira de miniaturas (con el "+") se oculta por completo para no duplicar
        // el punto de entrada.
        empty.style.display = "block";
        empty.innerHTML = `<p>🎵 Ingrese una imagen para comenzar</p><p style="font-size:0.8rem;color:#888;">Arrastra un archivo o haz clic aquí</p>`;
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
      actualizarContadores();
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
    document.getElementById("close-modal").onclick = () => { modalEsperandoCarga = false; working = carouselData.map(i => ({ ...i })); modal.style.display = "none"; };
    document.getElementById("carousel-close-btn").onclick = () => { modalEsperandoCarga = false; working = carouselData.map(i => ({ ...i })); modal.style.display = "none"; };

    renderTodoRef = renderTodo;

    window.showCarouselModal = () => {
      seleccionActual = 0;
      if (!carouselCargado) {
        // Se pidió abrir el editor antes de que Firestore contestara la
        // primera vez: no copiamos nada todavía (ver renderizarCarrusel,
        // que es quien completa "working" apenas llegue esa respuesta).
        modalEsperandoCarga = true;
        working = [];
      } else {
        modalEsperandoCarga = false;
        working = carouselData.map(item => ({ ...item }));
      }
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

    // v3.0 (P-06): pausa la rotación automática mientras el mouse está
    // encima o el carrusel tiene foco de teclado, para que no "salte" de
    // imagen mientras alguien está leyendo el texto.
    const visual = document.getElementById("carrusel-visual");
    if (visual) {
      visual.addEventListener("mouseenter", autoRotacionStop);
      visual.addEventListener("mouseleave", autoRotacionStart);
      visual.addEventListener("focusin", autoRotacionStop);
      visual.addEventListener("focusout", autoRotacionStart);

      // v3.0 (G-10): navegación con flechas del teclado cuando el carrusel
      // tiene el foco.
      visual.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft") { anteriorSlide(); autoRotacionStop(); autoRotacionStart(); }
        else if (e.key === "ArrowRight") { siguienteSlide(); autoRotacionStop(); autoRotacionStart(); }
      });

      // v3.0 (G-09): gesto de swipe para celular (sin librerías: solo
      // compara la posición X inicial y final del toque).
      let touchStartX = null;
      visual.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
      visual.addEventListener("touchend", (e) => {
        if (touchStartX === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 40) { // umbral mínimo para no confundir con un toque normal
          if (dx < 0) siguienteSlide(); else anteriorSlide();
          autoRotacionStop(); autoRotacionStart();
        }
        touchStartX = null;
      }, { passive: true });
    }

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

// ==================== CITAS DE LA PORTADA (G-07) ====================
// Antes eran 3 tarjetas de texto fijo ("— Cita 1/2/3") escritas directo en
// el HTML. Ahora viven en Firestore (contenido/citas) igual que el resto
// del contenido editable del sitio, con un botón de edición visible solo
// para quien puede editar el carrusel (mismo permiso: edit_carousel +
// owner_supremo/director_nacional, porque es contenido del carrusel
// nacional de la portada).
(function () {
  const citasRef = doc(db, "contenido", "citas");
  const DEFAULTS = [
    { texto: "La música transformó mi manera de ver el mundo y de relacionarme con los demás.", autor: "Testimonio de la comunidad" },
    { texto: "Gracias al Sistema pude formarme como músico y hoy enseño a nuevas generaciones.", autor: "Testimonio de la comunidad" },
    { texto: "Un espacio de oportunidades donde la disciplina y el arte van de la mano.", autor: "Testimonio de la comunidad" }
  ];
  let citasActuales = DEFAULTS;

  function renderCitas(items) {
    const cont = document.getElementById("citas-grid");
    if (!cont) return;
    cont.innerHTML = "";
    items.forEach(c => {
      const card = document.createElement("div");
      card.className = "cita-card";
      card.innerHTML = `
        <i class="fa-solid fa-quote-left" aria-hidden="true"></i>
        <p>"${window._escapeHtml ? window._escapeHtml(c.texto || "") : (c.texto || "")}"</p>
        <div class="cita-autor">— ${window._escapeHtml ? window._escapeHtml(c.autor || "Testimonio") : (c.autor || "Testimonio")}</div>`;
      cont.appendChild(card);
    });
  }

  function initCitasModal() {
    const btnEditar = document.getElementById("btn-editar-citas");
    if (btnEditar) btnEditar.style.display = "inline-flex";

    function renderCampos() {
      const wrap = document.getElementById("citas-editor-campos");
      if (!wrap) return;
      wrap.innerHTML = citasActuales.map((c, i) => `
        <div class="editor-row" style="border-top:${i ? "1px solid rgba(255,255,255,0.15)" : "none"};padding-top:${i ? "0.9rem" : "0"};margin-top:${i ? "0.9rem" : "0"};">
          <label>Cita ${i + 1} — Texto:</label>
          <input type="text" class="form-control cita-texto-input" data-idx="${i}" value="${window._escapeHtml ? window._escapeHtml(c.texto || "") : ""}" maxlength="220" placeholder="Texto de la cita">
          <label style="margin-top:0.5rem;">Cita ${i + 1} — Autor:</label>
          <input type="text" class="form-control cita-autor-input" data-idx="${i}" value="${window._escapeHtml ? window._escapeHtml(c.autor || "") : ""}" maxlength="60" placeholder="Quién lo dijo">
        </div>`).join("");
    }

    btnEditar?.addEventListener("click", () => {
      renderCampos();
      document.getElementById("modal-citas").style.display = "flex";
    });
    const cerrar = () => { document.getElementById("modal-citas").style.display = "none"; };
    document.getElementById("citas-close-btn")?.addEventListener("click", cerrar);
    document.getElementById("close-citas-modal")?.addEventListener("click", cerrar);
    document.getElementById("modal-citas")?.addEventListener("click", (e) => { if (e.target.id === "modal-citas") cerrar(); });

    document.getElementById("save-citas-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("save-citas-btn");
      const textoInputs = document.querySelectorAll(".cita-texto-input");
      const autorInputs = document.querySelectorAll(".cita-autor-input");
      const nuevas = Array.from(textoInputs).map((el, i) => ({
        texto: el.value.trim(),
        autor: autorInputs[i]?.value.trim() || "Testimonio de la comunidad"
      }));
      btn.disabled = true; const textoOriginal = btn.textContent; btn.textContent = "Guardando...";
      try {
        await setDoc(citasRef, { items: nuevas });
        window._showToast?.("Citas actualizadas", "success");
        cerrar();
      } catch (err) {
        console.error("No se pudieron guardar las citas:", err);
        window._showToast?.("No se pudieron guardar las citas", "error");
      } finally {
        btn.disabled = false; btn.textContent = textoOriginal;
      }
    });
  }

  onSnapshot(citasRef, snap => {
    citasActuales = (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length) ? snap.data().items : DEFAULTS;
    renderCitas(citasActuales);
  }, err => {
    console.error("No se pudieron cargar las citas (se muestran las de por defecto):", err);
    renderCitas(DEFAULTS);
  });

  try {
    const rol = window.Auth?.getSession()?.role;
    if (["owner_supremo", "director_nacional"].includes(rol)) initCitasModal();
  } catch (err) { console.error("Error al inicializar el editor de citas:", err); }
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
