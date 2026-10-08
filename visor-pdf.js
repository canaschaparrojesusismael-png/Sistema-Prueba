// ================================================================
// VISOR DE PDF PROPIO (PDF.js) — v4.0
// Reemplaza al <iframe>: se ve igual en PC y celular, deja hacer zoom, cambiar de
// página, pantalla completa y descargar con el nombre correcto.
// ================================================================
import { urlDescarga, descargarArchivo } from "./almacen.js";

const V = "3.11.174";
let cargaLib = null;
export function cargarPDFJS() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!cargaLib) cargaLib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.min.js`;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${V}/pdf.worker.min.js`; res(window.pdfjsLib); };
    s.onerror = () => { cargaLib = null; rej(new Error("No se pudo cargar el visor de PDF.")); };
    document.head.appendChild(s);
  });
  return cargaLib;
}
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function mensajeError(status, url) {
  if (status === 401 || status === 403) return { titulo: "El almacenamiento no permite abrir este PDF", detalle: "Cloudinary suele bloquear PDF en cuentas gratuitas. Un director debe activar “Allow delivery of PDF and ZIP files” en Cloudinary → Settings → Security (ver Plan 2.0 §7.4).", codigo: status };
  if (status === 404) return { titulo: "No se encontró el archivo", detalle: "El PDF ya no está en el almacenamiento. Súbelo de nuevo.", codigo: status };
  return { titulo: "No se pudo abrir el PDF", detalle: "Revisa tu conexión e inténtalo otra vez.", codigo: status };
}

export async function montarVisorPDF(contenedor, { url, nombre = "Documento", nombreDescarga } = {}) {
  const ctrl = { destruido: false, destruir() { this.destruido = true; obs?.disconnect(); contenedor.innerHTML = ""; } };
  let obs = null;
  const descNombre = nombreDescarga || nombre;
  contenedor.innerHTML = `
    <div class="visor-pdf">
      <div class="visor-pdf-barra">
        <span class="visor-titulo" title="${esc(nombre)}">${esc(nombre)}</span>
        <button type="button" data-v="prev" aria-label="Página anterior" title="Página anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="visor-pag" id="visor-pag" aria-live="polite">– / –</span>
        <button type="button" data-v="next" aria-label="Página siguiente" title="Página siguiente"><i class="fa-solid fa-chevron-right"></i></button>
        <button type="button" data-v="menos" aria-label="Alejar" title="Alejar"><i class="fa-solid fa-minus"></i></button>
        <span class="visor-pag" id="visor-zoom">100 %</span>
        <button type="button" data-v="mas" aria-label="Acercar" title="Acercar"><i class="fa-solid fa-plus"></i></button>
        <button type="button" data-v="ajustar" title="Ajustar al ancho"><i class="fa-solid fa-left-right"></i></button>
        <button type="button" data-v="full" aria-label="Pantalla completa" title="Pantalla completa"><i class="fa-solid fa-expand"></i></button>
        <a href="${esc(url)}" target="_blank" rel="noopener" title="Abrir en una pestaña nueva"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
        <button type="button" data-v="descargar" class="visor-descargar"><i class="fa-solid fa-download"></i> Descargar</button>
      </div>
      <div class="visor-pdf-paginas" id="visor-paginas" tabindex="0"><div class="skeleton" style="width:min(640px,90%);height:820px;"></div></div>
    </div>`;
  const raiz = contenedor.querySelector(".visor-pdf");
  const zona = contenedor.querySelector("#visor-paginas");
  const indPag = contenedor.querySelector("#visor-pag"), indZoom = contenedor.querySelector("#visor-zoom");
  raiz.querySelector('[data-v="descargar"]').addEventListener("click", () => descargarArchivo(url, descNombre));
  raiz.querySelector('[data-v="full"]').addEventListener("click", () => raiz.classList.toggle("visor-pdf-fullscreen"));

  const falla = (e) => {
    zona.innerHTML = `<div class="visor-pdf-aviso"><i class="fa-solid fa-triangle-exclamation"></i><h3>${esc(e.titulo)}</h3><p>${esc(e.detalle)}</p>
      <div class="botones"><a class="btn btn-cerrar" href="${esc(url)}" target="_blank" rel="noopener">Abrir en pestaña nueva</a><a class="btn btn-submit" href="${esc(urlDescarga(url, descNombre))}" target="_blank" rel="noopener">Descargar</a></div></div>`;
  };

  let pdf;
  try {
    const lib = await cargarPDFJS();
    if (ctrl.destruido) return ctrl;
    const r = await fetch(url);
    if (!r.ok) { falla(mensajeError(r.status, url)); return ctrl; }
    pdf = await lib.getDocument({ data: await r.arrayBuffer() }).promise;
  } catch (err) {
    if (!ctrl.destruido) falla(/No se pudo cargar el visor/.test(err.message) ? { titulo: "No se pudo cargar el visor", detalle: "Revisa tu conexión e inténtalo otra vez.", codigo: 0 } : mensajeError(0, url));
    return ctrl;
  }
  if (ctrl.destruido) return ctrl;

  const total = pdf.numPages;
  const primera = await pdf.getPage(1);
  const base = primera.getViewport({ scale: 1 });
  let escala = 1, modoAjuste = true;
  const marcos = [], dibujado = new Map();

  const anchoDisponible = () => Math.max(240, zona.clientWidth - 32);
  function fijarEscala() {
    if (modoAjuste) escala = Math.min(2.2, anchoDisponible() / base.width);
    indZoom.textContent = `${Math.round(escala * 100)} %`;
  }
  async function dibujar(i) {
    const marco = marcos[i - 1]; if (!marco || dibujado.get(i) === escala) return;
    dibujado.set(i, escala);
    const pg = await pdf.getPage(i); if (ctrl.destruido) return;
    const vp = pg.getViewport({ scale: escala }), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
    await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (ctrl.destruido || dibujado.get(i) !== escala) return;
    marco.replaceChildren(canvas); marco.classList.add("lista");
  }
  function maquetar() {
    fijarEscala(); dibujado.clear();
    marcos.forEach((m, idx) => { m.style.width = `${base.width * escala}px`; m.style.height = `${base.height * escala}px`; m.classList.remove("lista"); m.replaceChildren(); });
    obs?.disconnect();
    obs = new IntersectionObserver((entradas) => entradas.forEach((e) => { if (e.isIntersecting) dibujar(Number(e.target.dataset.n)); }), { root: zona, rootMargin: "600px 0px" });
    marcos.forEach((m) => obs.observe(m));
  }
  zona.innerHTML = "";
  for (let i = 1; i <= total; i++) {
    const m = document.createElement("div"); m.className = "visor-pdf-pagina"; m.dataset.n = i; m.setAttribute("aria-label", `Página ${i}`);
    zona.appendChild(m); marcos.push(m);
  }
  maquetar();

  let paginaActual = 1;
  const ir = (n) => { n = Math.min(total, Math.max(1, n)); marcos[n - 1].scrollIntoView({ behavior: "smooth", block: "start" }); };
  const actualizarPag = () => {
    const ref = zona.getBoundingClientRect().top + 40;
    for (let i = 0; i < marcos.length; i++) { if (marcos[i].getBoundingClientRect().bottom > ref) { paginaActual = i + 1; break; } }
    indPag.textContent = `${paginaActual} / ${total}`;
  };
  zona.addEventListener("scroll", actualizarPag, { passive: true }); actualizarPag();
  raiz.querySelector('[data-v="prev"]').addEventListener("click", () => ir(paginaActual - 1));
  raiz.querySelector('[data-v="next"]').addEventListener("click", () => ir(paginaActual + 1));
  const zoom = (f) => { modoAjuste = false; escala = Math.min(3.5, Math.max(0.4, escala * f)); maquetar(); };
  raiz.querySelector('[data-v="mas"]').addEventListener("click", () => zoom(1.2));
  raiz.querySelector('[data-v="menos"]').addEventListener("click", () => zoom(1 / 1.2));
  raiz.querySelector('[data-v="ajustar"]').addEventListener("click", () => { modoAjuste = true; maquetar(); });
  zona.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); ir(paginaActual + 1); } else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); ir(paginaActual - 1); } });
  let t; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { if (!ctrl.destruido && modoAjuste) maquetar(); }, 200); });
  ctrl.paginas = total;
  return ctrl;
}

// Dibuja la página 1 de un PDF en un <canvas> (miniaturas de tarjetas). No lanza errores: devuelve false si no se pudo.
export async function dibujarMiniaturaPDF(canvas, url, anchoPx = 320) {
  try {
    const lib = await cargarPDFJS();
    const pdf = await lib.getDocument({ url, disableAutoFetch: true, disableStream: false }).promise;
    const pg = await pdf.getPage(1);
    const v1 = pg.getViewport({ scale: 1 }), esc2 = anchoPx / v1.width, vp = pg.getViewport({ scale: esc2 * (window.devicePixelRatio > 1 ? 1.5 : 1) });
    canvas.width = vp.width; canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    return true;
  } catch { return false; }
}
