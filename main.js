import { auth, db } from "./firebase-init.js";

(function () {
  "use strict";
  const CAROUSEL_STORAGE = "sistemaOrquestas_carousel";

  function loadCarouselData() {
    const stored = localStorage.getItem(CAROUSEL_STORAGE);
    if (stored) { try { return JSON.parse(stored); } catch (e) {} }
    return [
      { src: "images.jpg", alt: "Imagen 1", text: "Texto descriptivo 1" },
      { src: "images.jpg", alt: "Imagen 2", text: "Texto descriptivo 2" }
    ];
  }

  let carouselData = loadCarouselData();
  let currentIndex = 0, autoInterval = null;

  function updateCarouselDisplay() {
    const imgEl = document.getElementById("carousel-image");
    const tituloEl = document.getElementById("carousel-title");
    const descEl = document.getElementById("carousel-desc");
    if (carouselData.length > 0) {
      const item = carouselData[currentIndex];
      if (imgEl) { imgEl.src = item.src; imgEl.alt = item.alt; }
      if (tituloEl) tituloEl.textContent = item.alt;
      if (descEl) descEl.textContent = item.text;
    }
  }

  function nextSlide() { if (!carouselData.length) return; currentIndex = (currentIndex + 1) % carouselData.length; updateCarouselDisplay(); }
  function prevSlide() { if (!carouselData.length) return; currentIndex = (currentIndex - 1 + carouselData.length) % carouselData.length; updateCarouselDisplay(); }
  function startAutoRotation() { stopAutoRotation(); autoInterval = setInterval(nextSlide, 4000); }
  function stopAutoRotation() { if (autoInterval) { clearInterval(autoInterval); autoInterval = null; } }
  function guardarCarouselData(data) {
    carouselData = data;
    localStorage.setItem(CAROUSEL_STORAGE, JSON.stringify(data));
    if (currentIndex >= carouselData.length) currentIndex = 0;
    updateCarouselDisplay();
  }

  // --- CROP ---
  let cropCallback = null;
  function abrirCropModal(file, callback) {
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

  // --- DRAG & DROP ---
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

  // --- MODAL CARRUSEL ---
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
          <div class="editor-row"><label>URL:</label><input type="text" class="img-url" value="${item.src}" data-index="${idx}" /><span>o archivo</span><input type="file" class="img-file" accept="image/*" data-index="${idx}" /></div>
          <div class="editor-row"><label>Título:</label><input type="text" class="img-alt" value="${item.alt}" /></div>
          <div class="editor-row"><label>Texto:</label><input type="text" class="img-text" value="${item.text}" /></div>
          <button class="btn btn-cerrar eliminar-item" data-index="${idx}">Eliminar</button>`;
        container.appendChild(div);
      });
      container.querySelectorAll(".img-file").forEach(inp => inp.addEventListener("change", function (e) {
        const idx = +this.dataset.index;
        const file = e.target.files[0];
        if (!file) return;
        abrirCropModal(file, (dataUrl) => {
          if (dataUrl) {
            const urlInput = document.querySelector(`.img-url[data-index="${idx}"]`) || document.querySelectorAll(".img-url")[idx];
            if (urlInput) urlInput.value = dataUrl;
            if (workingData[idx]) workingData[idx].src = dataUrl;
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
        src: fila.querySelector(".img-url")?.value || "",
        alt: fila.querySelector(".img-alt")?.value || "",
        text: fila.querySelector(".img-text")?.value || ""
      }));
    }

    document.getElementById("add-image-btn").onclick = () => { sincronizarFormulario(); workingData.push({ src: "", alt: "", text: "" }); renderItems(); };
    document.getElementById("save-carousel-btn").onclick = () => { sincronizarFormulario(); guardarCarouselData(workingData); modal.style.display = "none"; };
    document.getElementById("close-modal").onclick = () => { workingData = [...carouselData]; modal.style.display = "none"; };
    document.getElementById("carousel-close-btn").onclick = () => { workingData = [...carouselData]; modal.style.display = "none"; };
    window.showCarouselModal = () => { workingData = [...carouselData]; renderItems(); modal.style.display = "flex"; };
  }

  window.addEventListener("DOMContentLoaded", () => {
    updateCarouselDisplay();
    startAutoRotation();
    document.getElementById("prev-slide")?.addEventListener("click", () => { prevSlide(); stopAutoRotation(); startAutoRotation(); });
    document.getElementById("next-slide")?.addEventListener("click", () => { nextSlide(); stopAutoRotation(); startAutoRotation(); });
    if (window.Auth.hasPermission("edit_carousel")) initCarouselModal();
    window.UI.render();
  });
})();
