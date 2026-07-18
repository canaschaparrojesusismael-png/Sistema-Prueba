import { db } from "./firebase-init.js";
import { collection, onSnapshot, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

(function () {
  "use strict";

  // ==================== REFERENCIA A FIRESTORE ====================
  const carruselCol = collection(db, "carrusel");

  // ==================== ESTADO LOCAL DEL CARRUSEL ====================
  let carouselData = [];            // datos reactivos desde Firestore
  let currentIndex = 0;
  let autoInterval = null;

  // ==================== RENDERIZADO HTML DEL CARRUSEL ====================
  function renderizarCarrusel(imagenes) {
    carouselData = imagenes;
    const imgEl = document.getElementById("carousel-image");
    const tituloEl = document.getElementById("carousel-title");
    const descEl = document.getElementById("carousel-desc");

    if (carouselData.length === 0) {
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

  function siguienteSlide() {
    if (carouselData.length === 0) return;
    currentIndex = (currentIndex + 1) % carouselData.length;
    renderizarCarrusel(carouselData);
  }
  function anteriorSlide() {
    if (carouselData.length === 0) return;
    currentIndex = (currentIndex - 1 + carouselData.length) % carouselData.length;
    renderizarCarrusel(carouselData);
  }

  function iniciarAutoRotacion() {
    detenerAutoRotacion();
    autoInterval = setInterval(siguienteSlide, 4000);
  }
  function detenerAutoRotacion() {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    }
  }

  // ==================== MIGRACIÓN LOCALSTORAGE → FIRESTORE (una sola vez) ====================
  async function migrarLocalStorageSiExiste() {
    const antiguo = localStorage.getItem("sistemaOrquestas_carousel");
    if (!antiguo) return;
    let datos;
    try { datos = JSON.parse(antiguo); } catch (e) { return; }
    if (!Array.isArray(datos) || datos.length === 0) return;

    // Solo migramos si no hay datos en Firestore
    const snapshot = await getDocs(carruselCol);
    if (!snapshot.empty) {
      localStorage.removeItem("sistemaOrquestas_carousel"); // ya migrado
      return;
    }

    const batch = writeBatch(db);
    datos.forEach((item, i) => {
      const nuevoDocRef = doc(carruselCol); // ID automático
      batch.set(nuevoDocRef, {
        url: item.src || "",
        alt: item.alt || "",
        text: item.text || "",
        orden: i
      });
    });
    await batch.commit();
    localStorage.removeItem("sistemaOrquestas_carousel");
  }

  // ==================== GUARDAR CAMBIOS DEL MODAL (usando writeBatch) ====================
  async function guardarEnFirestore(nuevosDatos) {
    try {
      // 1. Obtener todos los documentos actuales
      const snapshot = await getDocs(carruselCol);
      const batch = writeBatch(db);

      // 2. Marcar todos los documentos existentes para borrar
      snapshot.docs.forEach(d => batch.delete(doc(db, "carrusel", d.id)));

      // 3. Insertar los nuevos con orden secuencial
      nuevosDatos.forEach((item, index) => {
        const nuevoDocRef = doc(carruselCol);
        batch.set(nuevoDocRef, {
          url: item.url || item.src || "",
          alt: item.alt || "",
          text: item.text || "",
          orden: index
        });
      });

      // 4. Commit atómico
      await batch.commit();
      console.log("Carrusel sincronizado con la nube.");
    } catch (error) {
      console.error("Error al guardar carrusel:", error);
    }
  }

  // ==================== MODAL DE EDICIÓN DEL CARRUSEL ====================
  // (crop, drag & drop, formulario) – mantiene la misma lógica, 
  // solo cambia la función de guardado al final.
  let cropCallback = null;

  function abrirCropModal(file, callback) {
    // ... (código completo del crop, sin cambios)
    cropCallback = callback;
    const modal = document.getElementById("crop-modal");
    const img = document.getElementById("crop-source");
    const canvas = document.getElementById("crop-canvas");
    const ctx = canvas.getContext("2d");
    const reader = new FileReader();
    reader.onload = function (e) {
      img.src = e.target.result;
      img.onload = function () {
        const cropArea = document.getElementById("crop-area");
        const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
        const displayW = img.width, displayH = img.height;
        let cropW = Math.min(displayW, displayH * (16/9));
        let cropH = cropW * (9/16);
        let cropX = (displayW - cropW) / 2, cropY = (displayH - cropH) / 2;
        function update() {
          cropArea.style.left = cropX + "px";
          cropArea.style.top = cropY + "px";
          cropArea.style.width = cropW + "px";
          cropArea.style.height = cropH + "px";
        }
        update();
        let dragging = false, startX, startY, sLeft, sTop, sW, sH;
        const handle = cropArea.querySelector(".resize-handle");
        function down(e) {
          e.preventDefault(); dragging = true;
          startX = e.clientX; startY = e.clientY;
          sLeft = cropX; sTop = cropY; sW = cropW; sH = cropH;
          document.addEventListener("pointermove", move);
          document.addEventListener("pointerup", up);
        }
        function move(e) {
          if (!dragging) return;
          const dx = e.clientX - startX, dy = e.clientY - startY;
          if (e.target === handle) {
            let nW = sW + dx; if (nW < 50) nW = 50;
            if (cropX + nW > displayW) nW = displayW - cropX;
            if (cropY + nW*(9/16) > displayH) { nW = (displayH - cropY) * (16/9); }
            cropW = nW; cropH = cropW * (9/16);
          } else {
            cropX = Math.max(0, Math.min(sLeft + dx, displayW - cropW));
            cropY = Math.max(0, Math.min(sTop + dy, displayH - cropH));
          }
          update();
        }
        function up() { dragging = false; document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); }
        cropArea.addEventListener("pointerdown", down);
        handle.addEventListener("pointerdown", down);
        document.getElementById("crop-confirm").onclick = () => {
          const sx = cropX * (naturalW / displayW), sy = cropY * (naturalH / displayH);
          const sw = cropW * (naturalW / displayW), sh = cropH * (naturalH / displayH);
          canvas.width = sw; canvas.height = sh;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          modal.style.display = "none";
          cropCallback(canvas.toDataURL("image/jpeg", 0.6));
        };
        document.getElementById("crop-cancel").onclick = () => { modal.style.display = "none"; cropCallback(null); };
        modal.style.display = "flex";
      };
    };
    reader.readAsDataURL(file);
  }

  function crearCropModal() {
    if (document.getElementById("crop-modal")) return;
    const div = document.createElement("div");
    div.id = "crop-modal";
    div.className = "modal-overlay crop-modal";
    div.innerHTML = `
      <div class="modal-content crop-content">
        <button class="modal-close-btn" id="crop-close-btn">&times;</button>
        <h2>Recortar imagen</h2>
        <div class="crop-container"><img id="crop-source" /><div id="crop-area" class="crop-area"><div class="resize-handle"></div></div></div>
        <canvas id="crop-canvas" style="display:none;"></canvas>
        <div class="crop-buttons">
          <button id="crop-confirm" class="btn btn-submit">Recortar</button>
          <button id="crop-cancel" class="btn btn-cerrar">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    document.getElementById("crop-close-btn").addEventListener("click", () => {
      document.getElementById("crop-modal").style.display = "none";
      if (cropCallback) cropCallback(null);
    });
  }

  function initDragDrop() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.querySelector("#carousel-items .img-file");
    if (!dropZone) return;
    ["dragenter","dragover","dragleave","drop"].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }));
    ["dragenter","dragover"].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.add("active")));
    ["dragleave","drop"].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.remove("active")));
    dropZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) abrirCropModal(files[0], (dataUrl) => {
        if (dataUrl) { const urlInput = document.querySelector("#carousel-items .img-url"); if (urlInput) urlInput.value = dataUrl; }
      });
    });
    dropZone.addEventListener("click", () => { if (fileInput) fileInput.click(); });
  }

  let modalReady = false;
  function initCarouselModal() {
    if (modalReady) return;
    modalReady = true;
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-content premium-modal">
        <button class="modal-close-btn" id="carousel-close-btn">&times;</button>
        <h2>Gestión del Carrusel</h2>
        <div class="drop-zone" id="drop-zone"><p>🎵 Arrastra una imagen aquí</p><p style="font-size:0.8rem;color:#888;">o haz clic para seleccionar</p></div>
        <div id="carousel-items"></div>
        <button id="add-image-btn" class="btn btn-submit">Agregar Imagen</button>
        <button id="save-carousel-btn" class="btn btn-submit" style="background: var(--color-primario);">Guardar Cambios</button>
        <button id="close-modal" class="btn btn-cerrar">Cerrar</button>
      </div>`;
    document.body.appendChild(modal);
    crearCropModal();
    initDragDrop();

    let workingData = [...carouselData];

    function renderItems() {
      const container = document.getElementById("carousel-items");
      container.innerHTML = "";
      workingData.forEach((item, idx) => {
        const div = document.createElement("div");
        div.className = "carousel-item-editor";
        div.innerHTML = `
          <div class="editor-row"><label>URL:</label><input type="text" class="img-url" value="${item.url || item.src || ""}" data-index="${idx}" /><span>o archivo</span><input type="file" class="img-file" accept="image/*" data-index="${idx}" /></div>
          <div class="editor-row"><label>Título:</label><input type="text" class="img-alt" value="${item.alt || ""}" /></div>
          <div class="editor-row"><label>Texto:</label><input type="text" class="img-text" value="${item.text || ""}" /></div>
          <button class="btn btn-cerrar eliminar-item" data-index="${idx}">Eliminar</button>`;
        container.appendChild(div);
      });
      container.querySelectorAll(".img-file").forEach(inp => inp.addEventListener("change", function (e) {
        const idx = +this.dataset.index;
        const file = e.target.files[0];
        if (!file) return;
        abrirCropModal(file, (dataUrl) => {
          if (dataUrl) {
            const urlInput = container.querySelector(`.img-url[data-index="${idx}"]`) || container.querySelectorAll(".img-url")[idx];
            if (urlInput) urlInput.value = dataUrl;
            if (workingData[idx]) workingData[idx].url = dataUrl;
          }
          e.target.value = "";
        });
      }));
      container.querySelectorAll(".eliminar-item").forEach(btn => btn.addEventListener("click", () => {
        sincronizarFormulario();
        workingData.splice(+btn.dataset.index, 1);
        renderItems();
      }));
    }

    function sincronizarFormulario() {
      workingData = [...document.querySelectorAll(".carousel-item-editor")].map(fila => ({
        url: fila.querySelector(".img-url")?.value || "",
        alt: fila.querySelector(".img-alt")?.value || "",
        text: fila.querySelector(".img-text")?.value || ""
      }));
    }

    document.getElementById("add-image-btn").onclick = () => { sincronizarFormulario(); workingData.push({ url: "", alt: "", text: "" }); renderItems(); };
    document.getElementById("save-carousel-btn").onclick = async () => {
      sincronizarFormulario();
      await guardarEnFirestore(workingData); // ¡Guarda en Firestore!
      modal.style.display = "none";
    };
    document.getElementById("close-modal").onclick = () => { workingData = [...carouselData]; modal.style.display = "none"; };
    document.getElementById("carousel-close-btn").onclick = () => { workingData = [...carouselData]; modal.style.display = "none"; };

    window.showCarouselModal = () => { workingData = carouselData.map(item => ({...item})); renderItems(); modal.style.display = "flex"; };
  }

  // ==================== INICIALIZACIÓN ====================
  function iniciarTodo() {
    // 1. Migrar datos antiguos si existen
    migrarLocalStorageSiExiste().then(() => {
      // 2. Escucha en tiempo real de Firestore
      const unsubscribe = onSnapshot(carruselCol, (snapshot) => {
        const imagenes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        imagenes.sort((a, b) => a.orden - b.orden); // orden lógico
        renderizarCarrusel(imagenes);
      }, (error) => console.error("Error al escuchar carrusel:", error));

      // Limpiar al descargar la página
      window.addEventListener("beforeunload", () => unsubscribe());
    });

    // 3. Controles de flechas
    document.getElementById("prev-slide")?.addEventListener("click", () => { anteriorSlide(); detenerAutoRotacion(); iniciarAutoRotacion(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { siguienteSlide(); detenerAutoRotacion(); iniciarAutoRotacion(); });

    // 4. Auto rotación
    iniciarAutoRotacion();

    // 5. Botón de edición (solo admin)
    if (window.Auth?.checkPermission("edit_carousel")) initCarouselModal();

    // 6. Renderizar UI
    window.UI?.render();
  }

  // Arranque inmediato (sin DOMContentLoaded porque es módulo ES)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarTodo);
  } else {
    iniciarTodo();
  }
})();
