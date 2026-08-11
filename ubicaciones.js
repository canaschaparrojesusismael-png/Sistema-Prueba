import { db } from "./firebase-init.js";
import { collection, query, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

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

export async function cargarNucleosPorEstado(estado, { forzar = false } = {}) {
  if (!estado) return [];
  if (!forzar && cacheNucleosPorEstado.has(estado)) return cacheNucleosPorEstado.get(estado);
  const snap = await getDocs(query(collection(db, "nucleos"), where("estado", "==", estado)));
  const lista = [...new Set(snap.docs.map(d => d.data().nombre))].sort();
  cacheNucleosPorEstado.set(estado, lista);
  return lista;
}

export async function crearNucleo(nombre, estado) {
  await addDoc(collection(db, "nucleos"), { nombre: nombre.trim(), estado });
  cacheNucleosPorEstado.delete(estado); // refrescar el caché de ese estado
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
          ${permitirCrearNucleo ? `<button type="button" id="ubicacion-btn-nuevo-nucleo" class="btn-config-mini" title="Crear núcleo nuevo" style="flex-shrink:0;">+ Nuevo</button>` : ""}
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
    const lista = await cargarNucleosPorEstado(estado, { forzar: true });
    selNucleo.innerHTML = lista.length
      ? lista.map(n => `<option value="${n}" ${n === preseleccionar ? "selected" : ""}>${n}</option>`).join("")
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
