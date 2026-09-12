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
// v3.1: el preset "orquestas_unsigned" en Cloudinary tiene un límite de
// tamaño configurado (hoy 10 MB). Si algún día se sube ese límite desde el
// panel de Cloudinary, este número también hay que actualizarlo — es solo
// para poder avisar ACÁ, al toque, en vez de esperar a que Cloudinary
// rechace la subida y devuelva un mensaje técnico en inglés.
const TAMANO_MAXIMO_MB = 10;

function formatoMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

export async function subirACloudinary(blob, carpeta = "general") {
  const limiteBytes = TAMANO_MAXIMO_MB * 1024 * 1024;
  if (blob.size > limiteBytes) {
    // v3.1: antes esto ni se chequeaba acá — se mandaba igual, Cloudinary
    // lo rechazaba, y el error que llegaba a la pantalla era el mensaje
    // técnico de Cloudinary tal cual ("File size too large. Got 11980848.
    // Maximum is 10485760."), que no dice nada útil para alguien que no
    // sabe qué es Cloudinary. Ahora se avisa antes de mandar nada, en
    // español y en MB.
    throw new Error(`El archivo pesa ${formatoMB(blob.size)} MB y el máximo permitido es ${TAMANO_MAXIMO_MB} MB. Probá con un archivo más liviano (por ejemplo, escaneando en menor resolución o comprimiendo el PDF).`);
  }
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", carpeta);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    // v3.0: antes de esto, un fallo devolvía siempre el mismo mensaje
    // genérico ("No se pudo subir la imagen"); ahora se intenta leer el
    // motivo real que da Cloudinary (ej. "tipo de archivo no permitido
    // por el preset"), que ayuda mucho más al diagnosticar un problema.
    let detalle = "";
    try { detalle = (await res.json())?.error?.message || ""; } catch {}
    // v3.1: si de todas formas Cloudinary contesta con su propio error de
    // tamaño (por ejemplo, si el límite cambió del lado de Cloudinary y
    // quedó más bajo que TAMANO_MAXIMO_MB de acá arriba), lo traducimos
    // igual en vez de mostrar el bytes crudo en inglés.
    const coincideTamano = detalle.match(/File size too large\.\s*Got\s*(\d+)\.\s*Maximum is\s*(\d+)/i);
    if (coincideTamano) {
      detalle = `El archivo pesa ${formatoMB(Number(coincideTamano[1]))} MB y el máximo permitido es ${formatoMB(Number(coincideTamano[2]))} MB. Probá con un archivo más liviano.`;
    }
    throw new Error(detalle || "No se pudo subir el archivo a Cloudinary");
  }
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
      // CORREGIDO 2026-09-06: el recuadro de recorte oscurece TODO lo que
      // queda afuera suyo con una sombra gigante (para que se vea qué se va
      // a cortar) — pero antes se quedaba ahí, tapando la imagen entera con
      // esa sombra, aunque la persona cambiara a "Rotar" o "Saturar", donde
      // no hay ningún recorte que mostrar. Por eso se veía "todo oscuro" en
      // esas pestañas: solo el recuadrito de recorte se veía claro. Ahora el
      // recuadro solo se muestra mientras la pestaña activa es "Recortar".
      document.getElementById("img-editor-area").style.display = btn.dataset.tool === "recortar" ? "block" : "none";
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
    // CORREGIDO 2026-09-05: un canvas nuevo empieza totalmente transparente
    // por dentro. Si algún borde queda sin cubrir por la imagen rotada —por
    // redondeo de subpíxeles cuando el ancho/alto original es impar, algo
    // habitual en fotos reales— esa franja transparente se exporta como
    // NEGRO al convertir a JPEG (los navegadores no tienen de otra: JPEG no
    // admite transparencia). Eso es exactamente el "fondo oscuro" que
    // aparecía al girar una imagen. Solución: pintamos el canvas de blanco
    // ANTES de dibujar nada, así cualquier borde que quede sin cubrir se ve
    // blanco (un margen casi imperceptible) en vez de una franja negra.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tmp.width, tmp.height);
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
    // CORREGIDO 2026-09-05: antes cada manija movía SU lado de forma
    // independiente (izq/der/arriba/abajo por separado), así que se podía
    // estirar el recuadro a cualquier forma, sin respetar la proporción del
    // flyer/carrusel (16:9, 20:13, etc.). Cuando la proporción del recorte
    // no coincidía con la de destino, el paso final rellenaba los bordes
    // sobrantes con transparencia — que sobre el fondo oscuro del sitio se
    // veía como esas líneas/franjas raras que reportaron. Ahora el ancho es
    // el único número que se calcula a partir del arrastre; el alto SIEMPRE
    // sale de dividir por aspectoActual, así que la proporción correcta es
    // imposible de romper, se arrastre lo que se arrastre.
    const MIN_W = MIN * aspectoActual;
    let anclaX, anclaY, signoX, signoY, deltaW;

    if (posHandle === "e") { anclaX = x0; signoX = 1; anclaY = y0 + h0 / 2; signoY = 0; deltaW = dx; }
    else if (posHandle === "w") { anclaX = x0 + w0; signoX = -1; anclaY = y0 + h0 / 2; signoY = 0; deltaW = -dx; }
    else if (posHandle === "s") { anclaX = x0 + w0 / 2; signoX = 0; anclaY = y0; signoY = 1; deltaW = dy * aspectoActual; }
    else if (posHandle === "n") { anclaX = x0 + w0 / 2; signoX = 0; anclaY = y0 + h0; signoY = -1; deltaW = -dy * aspectoActual; }
    else {
      // Esquinas (nw/ne/sw/se): la esquina OPUESTA queda fija (ancla). De
      // los dos ejes que el arrastre mueve, usamos el que implique el
      // cambio de ancho más grande — así el recorte responde al gesto
      // dominante del dedo/mouse, sin perder nunca la proporción.
      const esteOeste = posHandle.includes("e") ? 1 : -1;
      const norteSur = posHandle.includes("s") ? 1 : -1;
      anclaX = posHandle.includes("e") ? x0 : x0 + w0;
      anclaY = posHandle.includes("s") ? y0 : y0 + h0;
      signoX = esteOeste; signoY = norteSur;
      const porX = esteOeste * dx;
      const porY = norteSur * dy * aspectoActual;
      deltaW = Math.abs(porX) >= Math.abs(porY) ? porX : porY;
    }

    // Topamos el ANCHO (un solo número) contra los bordes de la imagen ANTES
    // de armar el recuadro final — así nunca hace falta "corregir" un
    // recuadro que ya se salió, que es lo que rompía la proporción antes.
    let nuevoW = Math.max(w0 + deltaW, MIN_W);
    if (signoX > 0) nuevoW = Math.min(nuevoW, dW - anclaX);
    if (signoX < 0) nuevoW = Math.min(nuevoW, anclaX);
    if (signoY > 0) nuevoW = Math.min(nuevoW, (dH - anclaY) * aspectoActual);
    if (signoY < 0) nuevoW = Math.min(nuevoW, anclaY * aspectoActual);
    if (signoX === 0) nuevoW = Math.min(nuevoW, 2 * Math.min(anclaX, dW - anclaX));
    if (signoY === 0) nuevoW = Math.min(nuevoW, 2 * Math.min(anclaY, dH - anclaY) * aspectoActual);
    nuevoW = Math.max(nuevoW, MIN_W);

    cW = nuevoW; cH = nuevoW / aspectoActual;
    cX = signoX > 0 ? anclaX : signoX < 0 ? anclaX - cW : anclaX - cW / 2;
    cY = signoY > 0 ? anclaY : signoY < 0 ? anclaY - cH : anclaY - cH / 2;
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
  // El tool por defecto siempre es "Recortar" (línea de arriba), así que el
  // recuadro de recorte también arranca visible — si la última vez se cerró
  // el editor estando en "Rotar", quedaría oculto por el fix de arriba.
  document.getElementById("img-editor-area").style.display = "block";
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
