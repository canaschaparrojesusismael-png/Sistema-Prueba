// ================================================================
// GESTOR DE IMÁGENES COMPARTIDO — recortar / rotar / saturar + Cloudinary.
//
// Antes: el Carrusel Nacional (main.js) y los Flyers (panel.html) tenían
// CADA UNO su propio editor de imagen, hechos en momentos distintos y con
// muy distinta calidad. El de flyers ni siquiera subía a Cloudinary: guardaba
// la foto completa como texto (base64) directo adentro del documento de
// Firestore, lo que arriesgaba pasarse del límite de 1 MB por documento que
// tiene Firestore con cualquier foto de calidad decente. Ahora los dos usan
// este mismo editor, con la misma calidad y las mismas herramientas.
// ================================================================

const CLOUD_NAME = "kjfgogu5";
const UPLOAD_PRESET = "orquestas_unsigned";

export async function subirACloudinary(blob, carpeta = "general") {
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", carpeta);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("No se pudo subir la imagen a Cloudinary");
  const data = await res.json();
  return data.secure_url;
}

// ---------------------------------------------------------------
// Modal del editor (recortar / rotar / saturar). Se crea una sola vez y se
// reutiliza. Usa IDs propios (img-editor-*) para no chocar con otros modales
// de recorte más viejos que puedan seguir viviendo en la misma página
// (por ejemplo, el recorte simple de la foto de eventos en panel.html).
// ---------------------------------------------------------------
let modalCreado = false;
let editorCallback = null;
let aspectoActual = 16 / 9;
let salidaActual = { ancho: 960, alto: 540 };
let carpetaActual = "general";

function crearModalEditor() {
  if (modalCreado) return;
  modalCreado = true;
  const div = document.createElement("div");
  div.id = "img-editor-modal";
  div.className = "modal-overlay crop-modal";
  div.innerHTML = `
    <div class="modal-content crop-content">
      <button class="modal-close-btn" id="img-editor-close-btn">&times;</button>
      <h2>Editor de imagen</h2>
      <div class="editor-tools">
        <button type="button" class="tool-btn active" data-tool="recortar"><i class="fa-solid fa-crop"></i> Recortar</button>
        <button type="button" class="tool-btn" data-tool="rotar"><i class="fa-solid fa-rotate"></i> Rotar</button>
        <button type="button" class="tool-btn" data-tool="saturar"><i class="fa-solid fa-droplet"></i> Saturar</button>
      </div>
      <div class="crop-container">
        <img id="img-editor-source"/>
        <div id="img-editor-area" class="crop-area">
          <div class="resize-handle rh-nw" data-pos="nw"></div>
          <div class="resize-handle rh-n" data-pos="n"></div>
          <div class="resize-handle rh-ne" data-pos="ne"></div>
          <div class="resize-handle rh-e" data-pos="e"></div>
          <div class="resize-handle rh-se" data-pos="se"></div>
          <div class="resize-handle rh-s" data-pos="s"></div>
          <div class="resize-handle rh-sw" data-pos="sw"></div>
          <div class="resize-handle rh-w" data-pos="w"></div>
        </div>
      </div>
      <div class="tool-panel" id="img-editor-panel-rotar" style="display:none;">
        <button type="button" id="img-editor-rotar-btn" class="btn btn-submit"><i class="fa-solid fa-rotate-right"></i> Rotar 90°</button>
      </div>
      <div class="tool-panel" id="img-editor-panel-saturar" style="display:none;">
        <label for="img-editor-sat-range">Saturación: <span id="img-editor-sat-value">100</span>%</label>
        <input type="range" id="img-editor-sat-range" min="0" max="200" value="100"/>
      </div>
      <canvas id="img-editor-canvas" style="display:none;"></canvas>
      <div class="crop-buttons">
        <button id="img-editor-confirm-btn" class="btn btn-submit">Aplicar y usar</button>
        <button id="img-editor-cancel-btn" class="btn btn-cerrar">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(div);

  div.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      div.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      div.querySelectorAll(".tool-panel").forEach((p) => (p.style.display = "none"));
      const panel = document.getElementById(`img-editor-panel-${btn.dataset.tool}`);
      if (panel) panel.style.display = "block";
    });
  });

  const satRange = document.getElementById("img-editor-sat-range");
  const satValue = document.getElementById("img-editor-sat-value");
  satRange.addEventListener("input", () => {
    satValue.textContent = satRange.value;
    document.getElementById("img-editor-source").style.filter = `saturate(${satRange.value}%)`;
  });

  document.getElementById("img-editor-rotar-btn").addEventListener("click", () => {
    const img = document.getElementById("img-editor-source");
    const tmp = document.createElement("canvas");
    const w = img.naturalWidth, h = img.naturalHeight;
    tmp.width = h; tmp.height = w;
    const ctx = tmp.getContext("2d");
    ctx.translate(h / 2, w / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    img.src = tmp.toDataURL("image/jpeg", 0.92);
  });
}

function inicializarAreaDeRecorte(aspecto) {
  const img = document.getElementById("img-editor-source");
  let area = document.getElementById("img-editor-area");
  const dW = img.width, dH = img.height;
  let cW = Math.min(dW, dH * aspecto), cH = cW / aspecto, cX = (dW - cW) / 2, cY = (dH - cH) / 2;
  const MIN = 40;
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const upd = () => { area.style.left = cX + "px"; area.style.top = cY + "px"; area.style.width = cW + "px"; area.style.height = cH + "px"; };

  // Clonamos el área para eliminar TODOS los listeners de una rotación/carga
  // anterior (si no, cada rotación iba dejando listeners fantasma acumulados).
  const nuevaArea = area.cloneNode(true);
  area.parentNode.replaceChild(nuevaArea, area);
  area = nuevaArea;
  upd();

  let modo = null;
  let sx, sy, startBox, posHandle;

  const moverMove = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    cX = clamp(startBox.cX + dx, 0, dW - cW);
    cY = clamp(startBox.cY + dy, 0, dH - cH);
    upd();
  };
  const redimensionarMove = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    const { cX: x0, cY: y0, cW: w0, cH: h0 } = startBox;
    let izq = x0, arr = y0, der = x0 + w0, aba = y0 + h0;
    if (posHandle.includes("w")) izq = clamp(x0 + dx, 0, der - MIN);
    if (posHandle.includes("e")) der = clamp(x0 + w0 + dx, izq + MIN, dW);
    if (posHandle.includes("n")) arr = clamp(y0 + dy, 0, aba - MIN);
    if (posHandle.includes("s")) aba = clamp(y0 + h0 + dy, arr + MIN, dH);
    cX = izq; cY = arr; cW = der - izq; cH = aba - arr;
    upd();
  };
  const onMove = (ev) => { if (modo === "mover") moverMove(ev); else if (modo === "redimensionar") redimensionarMove(ev); };
  const onUp = () => { modo = null; document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };

  area.querySelectorAll(".resize-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      modo = "redimensionar"; posHandle = handle.dataset.pos;
      sx = ev.clientX; sy = ev.clientY; startBox = { cX, cY, cW, cH };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });
  area.addEventListener("pointerdown", (ev) => {
    if (ev.target.classList.contains("resize-handle")) return;
    ev.preventDefault(); modo = "mover";
    sx = ev.clientX; sy = ev.clientY; startBox = { cX, cY };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  area._getCropBox = () => ({ cX, cY, cW, cH, dW, dH });
  area._destruir = () => onUp();
}

// Aplica saturación píxel por píxel. Es más código que usar ctx.filter, pero
// garantiza el mismo resultado en TODOS los navegadores (ctx.filter +
// drawImage no se comporta igual en Safari/versiones viejas).
function aplicarSaturacionManual(imageData, satPercent) {
  const factor = satPercent / 100;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const gris = 0.2989 * r + 0.587 * g + 0.114 * b;
    d[i] = Math.max(0, Math.min(255, gris + (r - gris) * factor));
    d[i + 1] = Math.max(0, Math.min(255, gris + (g - gris) * factor));
    d[i + 2] = Math.max(0, Math.min(255, gris + (b - gris) * factor));
  }
  return imageData;
}

/**
 * Abre el editor de imagen y, al confirmar, sube el resultado a Cloudinary.
 * @param {File} file - archivo elegido por el usuario
 * @param {Object} opciones
 *   - carpeta: subcarpeta de Cloudinary donde guardar ("carrusel", "flyers"...)
 *   - aspecto: relación ancho/alto del recorte (ej. 16/9, 20/13)
 *   - ancho, alto: tamaño en píxeles de la imagen final subida
 * @param {(url: string|null) => void} callback - recibe la URL final, o null si se canceló/falló
 */
export function abrirEditorImagen(file, opciones, callback) {
  crearModalEditor();
  aspectoActual = opciones?.aspecto || 16 / 9;
  salidaActual = { ancho: opciones?.ancho || 960, alto: opciones?.alto || 540 };
  carpetaActual = opciones?.carpeta || "general";
  editorCallback = callback;

  const modal = document.getElementById("img-editor-modal");
  const img = document.getElementById("img-editor-source");
  const confirmBtn = document.getElementById("img-editor-confirm-btn");
  const origText = confirmBtn.textContent;

  modal.querySelectorAll(".tool-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
  modal.querySelectorAll(".tool-panel").forEach((p) => (p.style.display = "none"));
  const satRange = document.getElementById("img-editor-sat-range");
  satRange.value = 100;
  document.getElementById("img-editor-sat-value").textContent = "100";
  img.style.filter = "saturate(100%)";

  img.onload = () => inicializarAreaDeRecorte(aspectoActual);

  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  reader.readAsDataURL(file);

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true; confirmBtn.textContent = "⏳ Subiendo...";
    try {
      const area = document.getElementById("img-editor-area");
      const box = area._getCropBox ? area._getCropBox() : null;
      const canvas = document.getElementById("img-editor-canvas");
      const ctx = canvas.getContext("2d");
      const escala = img.naturalWidth / img.width;
      const finalW = salidaActual.ancho, finalH = salidaActual.alto;
      canvas.width = finalW; canvas.height = finalH;
      ctx.clearRect(0, 0, finalW, finalH);
      ctx.filter = "none";

      let usaTransparencia = false;
      if (box) {
        const anchoReal = box.cW * escala, altoReal = box.cH * escala;
        const aspectCanvas = finalW / finalH;
        const aspectRecorte = box.cW / box.cH;
        const necesitaAjuste = Math.abs(aspectRecorte - aspectCanvas) > 0.02;
        if (necesitaAjuste) {
          usaTransparencia = true;
          const escalaFit = Math.min(finalW / anchoReal, finalH / altoReal);
          const wDibujo = anchoReal * escalaFit, hDibujo = altoReal * escalaFit;
          const offX = (finalW - wDibujo) / 2, offY = (finalH - hDibujo) / 2;
          ctx.drawImage(img, box.cX * escala, box.cY * escala, anchoReal, altoReal, offX, offY, wDibujo, hDibujo);
        } else {
          ctx.drawImage(img, box.cX * escala, box.cY * escala, box.cW * escala, box.cH * escala, 0, 0, finalW, finalH);
        }
      } else {
        ctx.drawImage(img, 0, 0, finalW, finalH);
      }
      const sat = Number(satRange.value);
      if (sat !== 100) {
        const datos = ctx.getImageData(0, 0, finalW, finalH);
        aplicarSaturacionManual(datos, sat);
        ctx.putImageData(datos, 0, 0);
      }
      const blob = await new Promise((res) => canvas.toBlob(res, usaTransparencia ? "image/png" : "image/jpeg", usaTransparencia ? undefined : 0.85));
      if (!blob) throw new Error("No se pudo generar la imagen");
      const url = await subirACloudinary(blob, carpetaActual);
      modal.style.display = "none";
      editorCallback(url);
    } catch (err) {
      console.error(err);
      window._showToast?.("No se pudo procesar la imagen: " + err.message, "error");
      document.getElementById("img-editor-area")._destruir?.();
      modal.style.display = "none";
      editorCallback(null);
    } finally {
      confirmBtn.disabled = false; confirmBtn.textContent = origText;
    }
  };
  document.getElementById("img-editor-cancel-btn").onclick = () => {
    document.getElementById("img-editor-area")._destruir?.();
    modal.style.display = "none"; editorCallback(null);
  };
  document.getElementById("img-editor-close-btn").onclick = () => {
    document.getElementById("img-editor-area")._destruir?.();
    modal.style.display = "none"; editorCallback(null);
  };

  modal.style.display = "flex";
}
