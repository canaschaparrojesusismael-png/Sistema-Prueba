// ================================================================
// ALMACÉN DE ARCHIVOS (PDF) — v4.0
// Capa única para subir / descargar PDF. Hoy usa Cloudinary (el mismo preset que ya
// usan las imágenes) pero TODO el sitio pasa por acá, así que cambiar de proveedor
// (Vercel Blob, Cloudflare R2…) es tocar solamente este archivo. Ver PLAN-2.0 §7.4.
// ================================================================
const CLOUD_NAME = "kjfgogu5";
const UPLOAD_PRESET = "orquestas_unsigned";
export const LIMITE_PDF_MB = 10;   // = límite del preset de Cloudinary (si lo cambias allá, cámbialo acá)

export const formatoTamano = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
};

export function validarPDF(file) {
  if (!file) throw new Error("Elige un archivo PDF.");
  const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!esPdf) throw new Error("Solo se aceptan archivos PDF.");
  if (file.size > LIMITE_PDF_MB * 1024 * 1024) throw new Error(`"${file.name}" pesa ${formatoTamano(file.size)} y el máximo es ${LIMITE_PDF_MB} MB. Prueba con un archivo más liviano.`);
  if (file.size === 0) throw new Error(`"${file.name}" está vacío.`);
  return true;
}

// Devuelve { url, bytes, nombreArchivo, proveedor, publicId, tipoRecurso }. onProgreso(0..1).
export function subirArchivo(file, { carpeta = "general", onProgreso } = {}) {
  validarPDF(file);
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", UPLOAD_PRESET);
    fd.append("folder", carpeta);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgreso) onProgreso(e.loaded / e.total); };
    xhr.onerror = () => reject(new Error("No se pudo conectar para subir el archivo. Revisa tu internet."));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* respuesta no JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve({ url: data.secure_url, bytes: data.bytes || file.size, nombreArchivo: file.name, proveedor: "cloudinary", publicId: data.public_id || "", tipoRecurso: data.resource_type || "" });
      } else {
        const detalle = data?.error?.message || `Error ${xhr.status}`;
        reject(new Error(/File size too large/i.test(detalle) ? `El archivo es demasiado grande para el almacenamiento (máx. ${LIMITE_PDF_MB} MB).` : `No se pudo subir: ${detalle}`));
      }
    };
    xhr.send(fd);
  });
}

const limpiarNombre = (n) => String(n || "archivo").replace(/\.pdf$/i, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "archivo";

// URL que fuerza la descarga con un nombre (Cloudinary: transformación fl_attachment).
export function urlDescarga(url, nombre) {
  if (typeof url === "string" && /res\.cloudinary\.com/.test(url) && url.includes("/upload/")) return url.replace("/upload/", `/upload/fl_attachment:${limpiarNombre(nombre)}/`);
  return url;
}

// Descarga real (con el nombre correcto). Intenta blob; si el servidor no permite CORS, usa la URL de descarga.
export async function descargarArchivo(url, nombre = "partitura") {
  const nombrePdf = /\.pdf$/i.test(nombre) ? nombre : `${nombre}.pdf`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombrePdf;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    window.open(urlDescarga(url, nombrePdf), "_blank", "noopener");
  }
}

// ZIP con varios PDF. archivos: [{ url, ruta }] (ruta = nombre dentro del ZIP, p. ej. "Himno/Violín 1.pdf").
let jszipPromesa = null;
function cargarJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!jszipPromesa) jszipPromesa = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("No se pudo cargar el compresor ZIP."));
    document.head.appendChild(s);
  });
  return jszipPromesa;
}
export async function descargarZip(archivos, nombreZip = "partituras", onProgreso) {
  if (!archivos.length) throw new Error("No hay archivos para descargar.");
  const JSZip = await cargarJSZip();
  const zip = new JSZip(); const usados = new Set(); let hechos = 0;
  for (const a of archivos) {
    const r = await fetch(a.url);
    if (!r.ok) throw new Error(`No se pudo descargar "${a.ruta}" (error ${r.status}).`);
    let ruta = a.ruta.replace(/[\\:*?"<>|]/g, "-"); let k = 2;
    while (usados.has(ruta)) ruta = a.ruta.replace(/(\.pdf)?$/i, ` (${k++}).pdf`);
    usados.add(ruta); zip.file(ruta, await r.blob());
    onProgreso?.(++hechos / archivos.length);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const el = document.createElement("a");
  el.href = URL.createObjectURL(blob); el.download = `${nombreZip}.zip`;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(el.href), 3000);
}
