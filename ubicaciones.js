import { db } from "./firebase-init.js";
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Los 23 estados + Distrito Capital: esto es geografía real de Venezuela y no
// cambia, así que va fijo en el código (no tiene sentido que alguien "cree"
// un estado nuevo). Lo único dinámico son los núcleos dentro de cada estado.
export const ESTADOS_VENEZUELA = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo",
  "Cojedes", "Delta Amacuro", "Distrito Capital", "Falcón", "Guárico", "Lara",
  "Mérida", "Miranda", "Monagas", "Nueva Esparta", "Portuguesa", "Sucre",
  "Táchira", "Trujillo", "La Guaira", "Yaracuy", "Zulia"
];

const cacheNucleosPorEstado = new Map();

// Devuelve [{id, nombre}] — el id hace falta para poder renombrar/eliminar.
export async function cargarNucleosConIdPorEstado(estado, { forzar = false } = {}) {
  if (!estado) return [];
  if (!forzar && cacheNucleosPorEstado.has(estado)) return cacheNucleosPorEstado.get(estado);
  const snap = await getDocs(query(collection(db, "nucleos"), where("estado", "==", estado)));
  const lista = snap.docs
    .map(d => ({ id: d.id, nombre: d.data().nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  cacheNucleosPorEstado.set(estado, lista);
  return lista;
}

// Compatibilidad con código existente que solo necesita los nombres.
export async function cargarNucleosPorEstado(estado, opts) {
  const lista = await cargarNucleosConIdPorEstado(estado, opts);
  return [...new Set(lista.map(n => n.nombre))];
}

export async function crearNucleo(nombre, estado) {
  await addDoc(collection(db, "nucleos"), { nombre: nombre.trim(), estado });
  cacheNucleosPorEstado.delete(estado); // refrescar el caché de ese estado
}

export async function renombrarNucleo(id, nuevoNombre, estado) {
  await updateDoc(doc(db, "nucleos", id), { nombre: nuevoNombre.trim() });
  cacheNucleosPorEstado.delete(estado);
}

export async function eliminarNucleo(id, estado) {
  await deleteDoc(doc(db, "nucleos", id));
  cacheNucleosPorEstado.delete(estado);
}

// Cuenta cuántos usuarios tienen asignado este núcleo — para avisar antes de
// borrarlo (borrar el núcleo NO borra ni desvincula a esos usuarios, solo
// hace que el nombre deje de aparecer en los selectores para elegir de nuevo).
export async function contarUsuariosEnNucleo(nombreNucleo) {
  const snap = await getDocs(query(collection(db, "usuarios"), where("nucleo", "==", nombreNucleo)));
  return snap.size;
}

/**
 * Abre un modal elegante (misma estética que el resto del sitio) para elegir
 * o crear Estado + Núcleo. Se puede usar desde cualquier página.
 *
 * options:
 *  - estadoInicial / nucleoInicial: preseleccionar valores
 *  - soloEstado: true → oculta el paso de núcleo (para roles que ven todo un estado)
 *  - permitirCrearNucleo: false → oculta el botón de "+ nuevo núcleo" (roles sin permiso)
 *  - onConfirmar({estado, nucleo}): callback al confirmar
 */
export function abrirSelectorUbicacion(options = {}) {
  const {
    estadoInicial = "", nucleoInicial = "", soloEstado = false,
    permitirCrearNucleo = true, onConfirmar = () => {},
  } = options;

  document.getElementById("ubicacion-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ubicacion-modal-overlay";
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="modal-content ubicacion-modal">
      <button type="button" class="modal-close-btn" id="ubicacion-close-btn">&times;</button>
      <h2><i class="fa-solid fa-location-dot"></i> Elegir ubicación</h2>
      <div class="editor-row">
        <label>Estado</label>
        <select id="ubicacion-select-estado" class="modal-input">
          <option value="">Seleccione un estado…</option>
          ${ESTADOS_VENEZUELA.map(e => `<option value="${e}" ${e === estadoInicial ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </div>
      <div class="editor-row" id="ubicacion-row-nucleo" style="${soloEstado ? "display:none;" : ""}">
        <label>Núcleo</label>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <select id="ubicacion-select-nucleo" class="modal-input" ${estadoInicial ? "" : "disabled"} style="flex:1;">
            <option value="">${estadoInicial ? "Cargando…" : "Elegí un estado primero"}</option>
          </select>
          ${permitirCrearNucleo ? `
            <button type="button" id="ubicacion-btn-renombrar-nucleo" class="btn-config-mini" title="Renombrar este núcleo" style="flex-shrink:0;"><i class="fa-solid fa-pen"></i></button>
            <button type="button" id="ubicacion-btn-borrar-nucleo" class="btn-config-mini" title="Eliminar este núcleo" style="flex-shrink:0;background:#c1121f;"><i class="fa-solid fa-trash"></i></button>
            <button type="button" id="ubicacion-btn-nuevo-nucleo" class="btn-config-mini" title="Crear núcleo nuevo" style="flex-shrink:0;">+ Nuevo</button>
          ` : ""}
        </div>
        <div id="ubicacion-crear-nucleo-form" style="display:none;margin-top:0.6rem;gap:0.5rem;">
          <input type="text" id="ubicacion-input-nuevo-nucleo" class="modal-input" placeholder="Nombre del nuevo núcleo…" style="margin-bottom:0.5rem;" />
          <div style="display:flex;gap:0.5rem;">
            <button type="button" id="ubicacion-btn-guardar-nucleo" class="btn btn-submit" style="flex:1;">Crear</button>
            <button type="button" id="ubicacion-btn-cancelar-nucleo" class="btn btn-cerrar" style="flex:1;">Cancelar</button>
          </div>
        </div>
      </div>
      <button type="button" id="ubicacion-btn-confirmar" class="btn btn-submit config-btn-full">Confirmar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const selEstado = document.getElementById("ubicacion-select-estado");
  const filaNucleo = document.getElementById("ubicacion-row-nucleo");
  const selNucleo = document.getElementById("ubicacion-select-nucleo");
  const formCrear = document.getElementById("ubicacion-crear-nucleo-form");

  async function refrescarNucleos(estado, preseleccionar = "") {
    if (!estado) { selNucleo.disabled = true; selNucleo.innerHTML = `<option value="">Elegí un estado primero</option>`; return; }
    selNucleo.disabled = true;
    selNucleo.innerHTML = `<option value="">Cargando…</option>`;
    const lista = await cargarNucleosConIdPorEstado(estado, { forzar: true });
    selNucleo.innerHTML = lista.length
      ? lista.map(n => `<option value="${n.nombre}" data-id="${n.id}" ${n.nombre === preseleccionar ? "selected" : ""}>${n.nombre}</option>`).join("")
      : `<option value="">(sin núcleos en este estado todavía)</option>`;
    selNucleo.disabled = false;
  }

  if (estadoInicial && !soloEstado) refrescarNucleos(estadoInicial, nucleoInicial);

  selEstado.addEventListener("change", () => {
    formCrear.style.display = "none";
    if (!soloEstado) refrescarNucleos(selEstado.value);
  });

  document.getElementById("ubicacion-btn-nuevo-nucleo")?.addEventListener("click", () => {
    if (!selEstado.value) { window._showToast?.("Elegí un estado primero", "error"); return; }
    formCrear.style.display = "flex";
    formCrear.style.flexDirection = "column";
    document.getElementById("ubicacion-input-nuevo-nucleo").value = "";
    document.getElementById("ubicacion-input-nuevo-nucleo").focus();
  });
  document.getElementById("ubicacion-btn-cancelar-nucleo")?.addEventListener("click", () => {
    formCrear.style.display = "none";
  });
  document.getElementById("ubicacion-btn-guardar-nucleo")?.addEventListener("click", async () => {
    const nombre = document.getElementById("ubicacion-input-nuevo-nucleo").value.trim();
    if (!nombre) return;
    const btn = document.getElementById("ubicacion-btn-guardar-nucleo");
    btn.disabled = true; btn.textContent = "Creando…";
    try {
      await crearNucleo(nombre, selEstado.value);
      window._showToast?.(`Núcleo "${nombre}" creado`, "success");
      formCrear.style.display = "none";
      await refrescarNucleos(selEstado.value, nombre);
    } catch (err) {
      window._showToast?.("No se pudo crear: " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "Crear";
    }
  });

  // ---- Renombrar el núcleo seleccionado ----
  document.getElementById("ubicacion-btn-renombrar-nucleo")?.addEventListener("click", async () => {
    const opt = selNucleo.selectedOptions[0];
    const id = opt?.dataset.id;
    if (!id) { window._showToast?.("Elegí un núcleo primero", "error"); return; }
    const nuevoNombre = prompt("Nuevo nombre para este núcleo:", opt.value);
    if (!nuevoNombre || !nuevoNombre.trim() || nuevoNombre.trim() === opt.value) return;
    try {
      await renombrarNucleo(id, nuevoNombre, selEstado.value);
      window._showToast?.("Núcleo renombrado", "success");
      await refrescarNucleos(selEstado.value, nuevoNombre.trim());
    } catch (err) {
      window._showToast?.("No se pudo renombrar: " + err.message, "error");
    }
  });

  // ---- Eliminar el núcleo seleccionado ----
  document.getElementById("ubicacion-btn-borrar-nucleo")?.addEventListener("click", async () => {
    const opt = selNucleo.selectedOptions[0];
    const id = opt?.dataset.id;
    if (!id) { window._showToast?.("Elegí un núcleo primero", "error"); return; }
    const cantidad = await contarUsuariosEnNucleo(opt.value).catch(() => 0);
    const aviso = cantidad > 0
      ? `Este núcleo tiene ${cantidad} usuario(s) asignados. Borrarlo NO los borra a ellos ni sus datos, pero el nombre dejará de aparecer en los selectores. ¿Eliminar igual "${opt.value}"?`
      : `¿Eliminar el núcleo "${opt.value}"? Esta acción no se puede deshacer.`;
    if (!confirm(aviso)) return;
    try {
      await eliminarNucleo(id, selEstado.value);
      window._showToast?.("Núcleo eliminado", "success");
      await refrescarNucleos(selEstado.value);
    } catch (err) {
      window._showToast?.("No se pudo eliminar: " + err.message, "error");
    }
  });

  const cerrar = () => overlay.remove();
  document.getElementById("ubicacion-close-btn").addEventListener("click", cerrar);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(); });

  document.getElementById("ubicacion-btn-confirmar").addEventListener("click", () => {
    const estado = selEstado.value;
    const nucleo = soloEstado ? "" : selNucleo.value;
    if (!estado) { window._showToast?.("Elegí un estado", "error"); return; }
    if (!soloEstado && !nucleo) { window._showToast?.("Elegí un núcleo (o creá uno nuevo)", "error"); return; }
    onConfirmar({ estado, nucleo });
    cerrar();
  });
}
