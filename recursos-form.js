// Formulario de recursos de Formación (v4.0). Lo usan formacion.html y recurso-detalle.html,
// así editar un recurso NO te saca del documento: el panel se abre encima.
import { db } from "./firebase-init.js";
import { collection, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { abrirPanel, esc } from "./ui-componentes.js";
import { subirArchivo, validarPDF, formatoTamano } from "./almacen.js";

export const TIPOS = [["Método", "📘"], ["Libro", "📖"], ["Corrección", "✏️"], ["Aclaración", "💡"], ["Video", "🎬"], ["Recurso", "📎"], ["Otro", "🗂️"]];
export const ICONO_POR_TIPO = Object.fromEntries(TIPOS);
export const esPDF = (u) => /\.pdf(\?|#|$)/i.test(u || "") || /res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/.+\.pdf/i.test(u || "");

export function abrirFormularioRecurso({ recurso = null, niveles = [], nivelInicial = "", sesion, onGuardado } = {}) {
  const editando = !!recurso;
  const nivelSel = recurso?.nivel || nivelInicial || niveles[0] || "";
  const p = abrirPanel({
    titulo: editando ? "Editar recurso" : "Nuevo recurso", ancho: "normal",
    cuerpoHTML: `
      <label for="rf-nivel">Nivel</label>
      <select id="rf-nivel">${niveles.map((n) => `<option value="${esc(n)}" ${n === nivelSel ? "selected" : ""}>${esc(n)}</option>`).join("")}${niveles.length ? "" : `<option value="">(Crea un nivel primero con ⚙)</option>`}</select>
      <label for="rf-tipo">Tipo</label>
      <select id="rf-tipo">${TIPOS.map(([t, i]) => `<option value="${esc(t)}" ${t === (recurso?.tipo || "Método") ? "selected" : ""}>${i} ${esc(t)}</option>`).join("")}</select>
      <label for="rf-nombre">Nombre</label><input id="rf-nombre" type="text" maxlength="120" value="${esc(recurso?.nombre || "")}" placeholder="Ej. Método Dan Hauser Vol. 1" autocomplete="off">
      <label for="rf-desc">Descripción breve <span style="text-transform:none;opacity:.8">(opcional)</span></label><input id="rf-desc" type="text" maxlength="200" value="${esc(recurso?.descripcion || "")}" placeholder="De qué trata este recurso" autocomplete="off">
      <label for="rf-pdf">Archivo PDF</label>
      <input id="rf-pdf" type="file" accept="application/pdf,.pdf">
      <p class="ayuda" id="rf-estado">${recurso?.url && esPDF(recurso.url) ? "Ya tiene un PDF. Si eliges otro, lo reemplaza." : "Máx. 10 MB."}</p>
      <label for="rf-url">…o un enlace <span style="text-transform:none;opacity:.8">(video, página web)</span></label>
      <input id="rf-url" type="url" maxlength="500" value="${recurso?.url && !esPDF(recurso.url) ? esc(recurso.url) : ""}" placeholder="https://…">
      <label for="rf-contenido">Texto del recurso <span style="text-transform:none;opacity:.8">(opcional)</span></label>
      <textarea id="rf-contenido" rows="4" maxlength="4000" placeholder="Notas, explicación…">${esc(recurso?.contenido || "")}</textarea>
      <div id="rf-prog" style="display:none;height:6px;border-radius:6px;background:rgba(255,255,255,.2);margin-top:.8rem;overflow:hidden"><i style="display:block;height:100%;width:0;background:#fff"></i></div>
      <p class="error-campo" id="rf-err" role="alert"></p>`,
    pieHTML: `<button type="button" class="btn btn-cerrar" id="rf-cancelar">Cancelar</button><button type="button" class="btn btn-submit" id="rf-guardar">${editando ? "Guardar cambios" : "Crear recurso"}</button>`,
  });
  const q = (s) => p.panel.querySelector(s);
  q("#rf-cancelar").addEventListener("click", p.cerrar);
  const err = q("#rf-err"), btn = q("#rf-guardar");
  btn.addEventListener("click", async () => {
    err.textContent = "";
    const nivel = q("#rf-nivel").value, nombre = q("#rf-nombre").value.trim(), archivo = q("#rf-pdf").files[0];
    let url = q("#rf-url").value.trim();
    if (!nivel) { err.textContent = "Elige un nivel (si no hay, créalo con la tuerca ⚙)."; return; }
    if (!nombre) { err.textContent = "Escribe el nombre del recurso."; q("#rf-nombre").focus(); return; }
    if (url && !/^https:\/\//i.test(url)) { err.textContent = "El enlace debe empezar con https://"; return; }
    if (archivo) { try { validarPDF(archivo); } catch (e) { err.textContent = e.message; return; } }
    btn.disabled = true; const t0 = btn.textContent;
    try {
      if (archivo) {
        btn.textContent = "Subiendo PDF…"; const prog = q("#rf-prog"); prog.style.display = "block";
        const a = await subirArchivo(archivo, { carpeta: "formacion", onProgreso: (x) => (prog.firstElementChild.style.width = `${Math.round(x * 100)}%`) });
        url = a.url;
      } else if (!url && recurso?.url && esPDF(recurso.url)) url = recurso.url;   // conserva el PDF actual
      const tipo = q("#rf-tipo").value;
      const datos = { nivel, tipo, nombre, icono: ICONO_POR_TIPO[tipo] || "📄", descripcion: q("#rf-desc").value.trim(), url, contenido: q("#rf-contenido").value.trim(),
        autor: recurso?.autor || sesion?.nombre || "", fechaCreacion: recurso?.fechaCreacion || new Date().toISOString() };
      if (editando) { datos.editadoPor = sesion?.nombre || ""; datos.fechaEdicion = new Date().toISOString(); await updateDoc(doc(db, "formacion_modulos", recurso.id), datos); }
      else await addDoc(collection(db, "formacion_modulos"), datos);
      window._showToast?.("Recurso guardado", "success"); p.cerrar(); onGuardado?.(nivel);
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = t0; }
  });
  return p;
}

export async function eliminarRecurso(r) {
  const ok = await window._confirmDialog(`Vas a eliminar <strong>“${esc(r.nombre)}”</strong>. Esta acción no se puede deshacer.`, { titulo: "¿Eliminar recurso?", peligroso: true, textoOk: "Sí, eliminar" });
  if (!ok) return false;
  try { await deleteDoc(doc(db, "formacion_modulos", r.id)); window._showToast?.("Recurso eliminado", "success"); return true; }
  catch (e) { window._showToast?.("No se pudo eliminar: " + e.message, "error"); return false; }
}
