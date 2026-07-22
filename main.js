import { db } from "./firebase-init.js";
import {
  collection, onSnapshot, getDocs, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

(function () {
  "use strict";

  // ==================== CONFIGURACIÓN DE CLOUDINARY ====================
  const CLOUD_NAME = "TU_CLOUD_NAME";           // Reemplaza con tu cloud name
  const UPLOAD_PRESET = "TU_UPLOAD_PRESET";     // Reemplaza con tu upload preset sin firmar

  // ==================== REFERENCIAS ====================
  const carruselCol = collection(db, "carrusel");

  // ==================== ESTADO DEL CARRUSEL ====================
  let carouselData = [];
  let currentIndex = 0;
  let autoInterval = null;

  // ==================== RENDERIZADO ====================
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

  // ==================== SUBIR A CLOUDINARY ====================
  /**
   * Sube un Blob (imagen o PDF) a Cloudinary usando unsigned upload.
   * @param {Blob} blob - Archivo binario
   * @param {string} carpeta - Carpeta en Cloudinary (ej. "carrusel")
   * @returns {Promise<string>} URL segura (https)
   */
  async function subirArchivoACloudinary(blob, carpeta = "carrusel") {
    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", carpeta);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Error al subir a Cloudinary");
    }

    const data = await response.json();
    return data.secure_url;
  }

  // ==================== MIGRACIÓN DE LOCALSTORAGE ====================
  async function migrarLocalStorageSiExiste() {
    const antiguo = localStorage.getItem("sistemaOrquestas_carousel");
    if (!antiguo) return;
    let datos;
    try { datos = JSON.parse(antiguo); } catch (e) { return; }
    if (!Array.isArray(datos) || datos.length === 0) return;

    const snapshot = await getDocs(carruselCol);
    if (!snapshot.empty) {
      localStorage.removeItem("sistemaOrquestas_carousel");
      return;
    }

    const batch = writeBatch(db);
    for (let i = 0; i < datos.length; i++) {
      const item = datos[i];
      let urlFinal = item.src || "";
      if (urlFinal.startsWith("data:")) {
        // Convertir base64 a Blob y subir a Cloudinary
        const resp = await fetch(urlFinal);
        const blob = await resp.blob();
        urlFinal = await subirArchivoACloudinary(blob, "carrusel");
      }
      const nuevoDocRef = doc(carruselCol);
      batch.set(nuevoDocRef, {
        url: urlFinal,
        alt: item.alt || "",
        text: item.text || "",
        orden: i
      });
    }
    await batch.commit();
    localStorage.removeItem("sistemaOrquestas_carousel");
  }

  // ==================== GUARDAR EN FIRESTORE ====================
  async function guardarEnFirestore(nuevosDatos) {
    try {
      const snapshot = await getDocs(carruselCol);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(doc(db, "carrusel", d.id)));
      nuevosDatos.forEach((item, index) => {
        const nuevoDocRef = doc(carruselCol);
        batch.set(nuevoDocRef, {
          url: item.url,
          alt: item.alt || "",
          text: item.text || "",
          orden: index
        });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error al guardar carrusel:", error);
      throw error;
    }
  }

  // ==================== CROP MODAL (con Cloudinary) ====================
  let cropCallback = null;

  function abrirCropModal(file, callback) {
    cropCallback = callback;
    const modal = document.getElementById("crop-modal");
    const img = document.getElementById("crop-source");
    const canvas = document.getElementById("crop-canvas");
    const ctx = canvas.getContext("2d");
    const confirmBtn = document.getElementById("crop-confirm");
    const originalText = confirmBtn.textContent;

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
            if (cropY + nW*(9/16) > displayH) nW = (displayH - cropY) * (16/9);
            cropW = nW; cropH = cropW * (9/16);
          } else {
            cropX = Math.max(0, Math.min(sLeft + dx, displayW - cropW));
            cropY = Math.max(0, Math.min(sTop + dy, displayH - cropH));
          }
          update();
        }
        function up() {
          dragging = false;
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
        }
        cropArea.addEventListener("pointerdown", down);
        handle.addEventListener("pointerdown", down);

        // Botón Recortar
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "⏳ Subiendo...";

          try {
            const blob = await new Promise((resolve) => {
              canvas.toBlob(resolve, "image/jpeg", 0.7);
            });
            if (!blob) throw new Error("No se pudo generar la imagen.");

            // Subir a Cloudinary
            const url = await subirArchivoACloudinary(blob, "carrusel");

            modal.style.display = "none";
            cropCallback(url);
          } catch (error) {
            console.error(error);
            cropCallback(null);
          } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText;
          }
        };

        document.getElementById("crop-cancel").onclick = () => {
          modal.style.display = "none";
          cropCallback(null);
        };
        document.getElementById("crop-close-btn").onclick = () => {
          modal.style.display = "none";
          cropCallback(null);
        };

        modal.style.display = "flex";
      };
    };
    reader.readAsDataURL(file);
  }

  // ==================== MODALES ====================
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
  }

  function initDragDrop() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.querySelector("#carousel-items .img-file");
    if (!dropZone) return;

    ["dragenter","dragover","dragleave","drop"].forEach(e =>
      dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); })
    );
    ["dragenter","dragover"].forEach(e =>
      dropZone.addEventListener(e, () => dropZone.classList.add("active"))
    );
    ["dragleave","drop"].forEach(e =>
      dropZone.addEventListener(e, () => dropZone.classList.remove("active"))
    );

    dropZone.addEventListener("drop", (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        abrirCropModal(files[0], (url) => {
          if (url) {
            const urlInput = document.querySelector("#carousel-items .img-url");
            if (urlInput) urlInput.value = url;
          }
        });
      }
    });

    dropZone.addEventListener("click", () => {
      if (fileInput) fileInput.click();
    });
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
          <div class="editor-row">
            <label>URL:</label>
            <input type="text" class="img-url form-control" value="${item.url || ""}" data-index="${idx}" />
            <span>o archivo</span>
            <input type="file" class="img-file form-control" accept="image/*" data-index="${idx}" />
          </div>
          <div class="editor-row">
            <label>Título:</label>
            <input type="text" class="img-alt form-control" value="${item.alt || ""}" />
          </div>
          <div class="editor-row">
            <label>Texto:</label>
            <input type="text" class="img-text form-control" value="${item.text || ""}" />
          </div>
          <button class="btn btn-cerrar eliminar-item" data-index="${idx}">Eliminar</button>`;
        container.appendChild(div);
      });

      container.querySelectorAll(".img-file").forEach(inp => inp.addEventListener("change", function (e) {
        const idx = +this.dataset.index;
        const file = e.target.files[0];
        if (!file) return;
        abrirCropModal(file, (url) => {
          if (url) {
            const urlInput = container.querySelector(`.img-url[data-index="${idx}"]`) ||
                             container.querySelectorAll(".img-url")[idx];
            if (urlInput) urlInput.value = url;
            if (workingData[idx]) workingData[idx].url = url;
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

    document.getElementById("add-image-btn").onclick = () => {
      sincronizarFormulario();
      workingData.push({ url: "", alt: "", text: "" });
      renderItems();
    };

    document.getElementById("save-carousel-btn").onclick = async () => {
      sincronizarFormulario();
      await guardarEnFirestore(workingData);
      modal.style.display = "none";
    };

    document.getElementById("close-modal").onclick = () => {
      workingData = [...carouselData];
      modal.style.display = "none";
    };
    document.getElementById("carousel-close-btn").onclick = () => {
      workingData = [...carouselData];
      modal.style.display = "none";
    };

    window.showCarouselModal = () => {
      workingData = carouselData.map(item => ({...item}));
      renderItems();
      modal.style.display = "flex";
    };
  }

  // ==================== INICIALIZACIÓN ====================
  async function iniciarTodo() {
    await migrarLocalStorageSiExiste();

    onSnapshot(carruselCol, (snapshot) => {
      const imagenes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      imagenes.sort((a, b) => a.orden - b.orden);
      renderizarCarrusel(imagenes);
    });

    document.getElementById("prev-slide")?.addEventListener("click", () => { anteriorSlide(); detenerAutoRotacion(); iniciarAutoRotacion(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { siguienteSlide(); detenerAutoRotacion(); iniciarAutoRotacion(); });

    iniciarAutoRotacion();

    if (window.Auth?.checkPermission && window.Auth.checkPermission("edit_carousel")) {
      initCarouselModal();
    }

    window.UI?.render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarTodo);
  } else {
    iniciarTodo();
  }
})();
