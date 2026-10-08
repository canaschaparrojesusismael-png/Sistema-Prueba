// ================================================================
// NÚCLEO ACTIVO — v4.0
//
// Una sola fuente de verdad para "¿en qué núcleo estoy trabajando?":
//  · Roles de un solo núcleo (director de núcleo, admin, profesor, estudiante):
//    es siempre SU núcleo (viene de su perfil real en Firestore).
//  · Roles multi-núcleo (owner, director nacional, director regional): se
//    elige desde el botón flotante de abajo a la derecha y se RECUERDA entre
//    páginas y entre sesiones (antes cada página arrancaba con el primer
//    núcleo en orden alfabético).
//
// Además dibuja:
//  · el rótulo del núcleo en la cabecera (texto, no botón), con tamaño
//    automático según la cantidad de caracteres;
//  · el botón flotante + panel "Núcleos" (estilo menú "Crear" de Pinterest)
//    donde se cambia, crea, renombra y elimina núcleos — en TODAS las páginas.
// ================================================================
import {
  ESTADOS_VENEZUELA, cargarTodosLosNucleos, crearNucleo, renombrarNucleo, eliminarNucleo,
  contarUsuariosEnNucleo, contarDocumentosDeNucleo, invalidarCacheSesionNucleos,
} from "./ubicaciones.js";

const ROLES_MULTI = ["owner_supremo", "director_nacional", "director_regional"];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sesion = () => window.Auth?.getSession?.() || null;
export const esMultiNucleo = (s = sesion()) => !!s && ROLES_MULTI.includes(s.role);
export const puedeGestionarNucleos = (s = sesion()) => !!s && ["owner_supremo", "director_nacional", "director_regional"].includes(s.role);

const claveAlmacen = (s) => `nucleoActivo:${s.uid}`;
const mismo = (a, b) => !!a && !!b && a.nombre === b.nombre && (!a.estado || !b.estado || a.estado === b.estado);
let activo = null;            // { nombre, estado } ya resuelto
let listaCache = [];          // [{id,nombre,estado}] permitidos para este usuario

export const etiquetaNucleo = (n) => (n?.nombre ? (n.estado ? `${n.nombre} (${n.estado})` : n.nombre) : "");
export const obtenerNucleoActivoSync = () => activo;

async function listaPermitida(s, forzar = false) {
  const todos = await cargarTodosLosNucleos({ forzar });
  return s.role === "director_regional" ? todos.filter((n) => n.estado === s.state) : todos;
}

export async function resolverNucleoActivo({ forzar = false } = {}) {
  const s = sesion();
  if (!s) return null;
  try { listaCache = await listaPermitida(s, forzar); } catch (e) { console.warn("No se pudo leer la lista de núcleos:", e); listaCache = []; }

  if (!esMultiNucleo(s)) {
    if (!s.nucleus) { activo = null; return null; }
    const enLista = listaCache.find((n) => n.nombre === s.nucleus);
    activo = { nombre: s.nucleus, estado: s.state || enLista?.estado || "" };
    return activo;
  }

  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(claveAlmacen(s)) || "null"); } catch { /* sin guardado */ }
  const valido = guardado && listaCache.find((n) => mismo(n, guardado));
  if (valido) activo = { nombre: valido.nombre, estado: valido.estado };
  else if (listaCache.length) { activo = { nombre: listaCache[0].nombre, estado: listaCache[0].estado }; guardar(s, activo); }
  else activo = null;
  return activo;
}

function guardar(s, n) {
  try { localStorage.setItem(claveAlmacen(s), JSON.stringify({ nombre: n.nombre, estado: n.estado })); } catch { /* no-op */ }
}

export function establecerNucleoActivo(n) {
  const s = sesion();
  if (!s || !n) return;
  activo = { nombre: n.nombre, estado: n.estado || "" };
  guardar(s, activo);
  pintarCabecera();
  window.dispatchEvent(new CustomEvent("nucleo-activo-cambiado", { detail: activo }));
}

// Llamar desde cada página: ejecuta cb ahora (con el núcleo ya resuelto) y de nuevo cada vez que cambie.
export async function conNucleoActivo(cb) {
  const n = await resolverNucleoActivo();
  window.addEventListener("nucleo-activo-cambiado", (e) => cb(e.detail));
  cb(n);
}

// ---------------------------------------------------------------
// CABECERA: [ícono chico] Nombre del núcleo (Estado)  |  [botones]
// ---------------------------------------------------------------
function tamanoPorLargo(texto) {
  const n = texto.length;
  if (n <= 16) return 1;
  if (n <= 24) return 0.92;
  if (n <= 32) return 0.84;
  if (n <= 42) return 0.76;
  return 0.7;
}

export function pintarCabecera() {
  const s = sesion();
  const header = document.querySelector("header.barra-superior");
  document.getElementById("header-identidad")?.remove();
  document.getElementById("header-identidad-sep")?.remove();
  if (!header || !s) return;

  let texto = etiquetaNucleo(activo);
  if (!texto) texto = ["owner_supremo", "director_nacional"].includes(s.role) ? "Sistema Nacional" : (s.state ? `Estado ${s.state}` : "");
  if (!texto) return;

  const bloque = document.createElement("div");
  bloque.id = "header-identidad";
  bloque.className = "header-identidad";
  bloque.title = texto;
  bloque.innerHTML = `<i class="fa-solid fa-building-columns" aria-hidden="true"></i><span class="header-identidad-texto" style="font-size:${tamanoPorLargo(texto)}rem">${esc(texto)}</span>`;
  const sep = document.createElement("span");
  sep.id = "header-identidad-sep";
  sep.className = "header-sep";
  sep.setAttribute("aria-hidden", "true");

  const nav = document.getElementById("user-nav");
  const antes = document.querySelector(".btn-menu-movil") || nav;
  if (antes?.parentElement === header) { header.insertBefore(bloque, antes); header.insertBefore(sep, antes); }
  else { header.appendChild(bloque); header.appendChild(sep); }
}

// ---------------------------------------------------------------
// BOTÓN FLOTANTE + PANEL "NÚCLEOS"
// ---------------------------------------------------------------
let panelAbierto = false;

export function montarGestorNucleos() {
  const s = sesion();
  document.getElementById("fab-nucleos")?.remove();
  document.getElementById("panel-nucleos")?.remove();
  if (!s || !esMultiNucleo(s)) return;

  const fab = document.createElement("button");
  fab.id = "fab-nucleos";
  fab.type = "button";
  fab.className = "fab-nucleos";
  fab.setAttribute("aria-label", "Cambiar o administrar núcleos");
  fab.innerHTML = `<i class="fa-solid fa-building-columns" aria-hidden="true"></i><span>Núcleos</span>`;
  document.body.appendChild(fab);

  const panel = document.createElement("section");
  panel.id = "panel-nucleos";
  panel.className = "panel-nucleos";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Núcleos");
  panel.innerHTML = `
    <header class="panel-nucleos-cab">
      <h2>Núcleos</h2>
      <button type="button" class="panel-nucleos-x" id="panel-nucleos-x" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <div class="panel-nucleos-cuerpo" id="panel-nucleos-cuerpo"></div>`;
  document.body.appendChild(panel);

  const cuerpo = panel.querySelector("#panel-nucleos-cuerpo");
  let filtro = "";
  let modo = "lista"; // lista | crear

  const cerrar = () => { panelAbierto = false; panel.classList.remove("abierto"); fab.classList.remove("oculto"); };
  const abrir = async () => {
    panelAbierto = true; panel.classList.add("abierto"); fab.classList.add("oculto");
    modo = "lista"; filtro = "";
    await resolverNucleoActivo({ forzar: true });
    pintar();
  };
  fab.addEventListener("click", abrir);
  panel.querySelector("#panel-nucleos-x").addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panelAbierto) cerrar(); });
  // composedPath() se calcula al lanzar el clic: sigue sirviendo aunque el botón pulsado ya se haya
  // redibujado/quitado del DOM (con panel.contains(e.target) el panel se cerraba solo al pulsar "Crear núcleo").
  document.addEventListener("click", (e) => {
    if (!panelAbierto) return;
    const ruta = e.composedPath ? e.composedPath() : [];
    if (ruta.includes(panel) || ruta.includes(fab)) return;
    if (ruta.some((n) => n.classList && (n.classList.contains("modal-overlay") || n.classList.contains("dialogo-overlay")))) return;
    cerrar();
  });

  function pintar() {
    if (modo === "crear") return pintarCrear();
    const puedeGestionar = puedeGestionarNucleos(s);
    const q = filtro.trim().toLowerCase();
    const visibles = listaCache.filter((n) => !q || n.nombre.toLowerCase().includes(q) || (n.estado || "").toLowerCase().includes(q));
    const porEstado = new Map();
    visibles.forEach((n) => { if (!porEstado.has(n.estado)) porEstado.set(n.estado, []); porEstado.get(n.estado).push(n); });

    cuerpo.innerHTML = `
      ${puedeGestionar ? `
      <button type="button" class="panel-nucleos-item panel-nucleos-crear" id="pn-crear">
        <span class="pn-tile pn-tile-rojo"><i class="fa-solid fa-plus"></i></span>
        <span class="pn-textos"><strong>Crear núcleo</strong><small>Agrega un núcleo nuevo a un estado</small></span>
      </button>` : ""}
      <div class="panel-nucleos-buscar"><i class="fa-solid fa-magnifying-glass"></i><input id="pn-buscar" type="search" placeholder="Buscar núcleo o estado…" value="${esc(filtro)}" autocomplete="off"></div>
      <div class="panel-nucleos-lista">
        ${visibles.length ? [...porEstado.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([estado, items]) => `
          <p class="pn-grupo">${esc(estado)}</p>
          ${items.map((n) => `
            <div class="panel-nucleos-item pn-fila ${mismo(activo, n) ? "pn-activo" : ""}" data-id="${esc(n.id)}" data-nombre="${esc(n.nombre)}" data-estado="${esc(n.estado)}" tabindex="0" role="button">
              <span class="pn-tile"><i class="fa-solid fa-building-columns"></i></span>
              <span class="pn-textos"><strong>${esc(n.nombre)}</strong><small>${esc(n.estado)}</small></span>
              ${mismo(activo, n) ? `<i class="fa-solid fa-circle-check pn-check" title="Núcleo activo"></i>` : ""}
              ${puedeGestionar ? `<span class="pn-acciones">
                <button type="button" class="pn-btn" data-accion="renombrar" title="Cambiar nombre"><i class="fa-solid fa-pen"></i></button>
                <button type="button" class="pn-btn pn-btn-peligro" data-accion="eliminar" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
              </span>` : ""}
            </div>`).join("")}`).join("") : `<p class="pn-vacio">${listaCache.length ? "Ningún núcleo coincide." : "Todavía no hay núcleos. Crea el primero."}</p>`}
      </div>`;

    cuerpo.querySelector("#pn-crear")?.addEventListener("click", () => { modo = "crear"; pintar(); });
    const buscar = cuerpo.querySelector("#pn-buscar");
    buscar.addEventListener("input", () => { filtro = buscar.value; const pos = buscar.selectionStart; pintar(); const nb = cuerpo.querySelector("#pn-buscar"); nb.focus(); nb.setSelectionRange(pos, pos); });
    cuerpo.querySelectorAll(".pn-fila").forEach((fila) => {
      const datos = { id: fila.dataset.id, nombre: fila.dataset.nombre, estado: fila.dataset.estado };
      const elegir = () => { establecerNucleoActivo(datos); cerrar(); window._showToast?.(`Núcleo activo: ${etiquetaNucleo(datos)}`, "success"); };
      fila.addEventListener("click", (e) => { if (e.target.closest(".pn-acciones")) return; elegir(); });
      fila.addEventListener("keydown", (e) => { if (e.key === "Enter") elegir(); });
      fila.querySelector('[data-accion="renombrar"]')?.addEventListener("click", (e) => { e.stopPropagation(); renombrar(datos); });
      fila.querySelector('[data-accion="eliminar"]')?.addEventListener("click", (e) => { e.stopPropagation(); eliminar(datos); });
    });
  }

  function pintarCrear() {
    const estadosPermitidos = s.role === "director_regional" ? [s.state] : ESTADOS_VENEZUELA;
    const estadoPorDefecto = activo?.estado && estadosPermitidos.includes(activo.estado) ? activo.estado : "";
    cuerpo.innerHTML = `
      <button type="button" class="panel-nucleos-volver" id="pn-volver"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      <div class="pn-form">
        <h3>Crear núcleo</h3>
        <label for="pn-estado">Estado</label>
        <select id="pn-estado"><option value="">Elige un estado…</option>${estadosPermitidos.map((e) => `<option value="${esc(e)}" ${e === estadoPorDefecto ? "selected" : ""}>${esc(e)}</option>`).join("")}</select>
        <label for="pn-nombre">Nombre del núcleo</label>
        <input id="pn-nombre" type="text" maxlength="80" placeholder="Ej. Puente Real" autocomplete="off">
        <div class="pn-form-botones">
          <button type="button" class="btn btn-cerrar" id="pn-cancelar">Cancelar</button>
          <button type="button" class="btn btn-submit" id="pn-guardar">Crear</button>
        </div>
      </div>`;
    const volver = () => { modo = "lista"; pintar(); };
    cuerpo.querySelector("#pn-volver").addEventListener("click", volver);
    cuerpo.querySelector("#pn-cancelar").addEventListener("click", volver);
    cuerpo.querySelector("#pn-nombre").focus();
    const guardarNucleo = async () => {
      const estado = cuerpo.querySelector("#pn-estado").value;
      const nombre = cuerpo.querySelector("#pn-nombre").value.trim();
      if (!estado) return window._showToast?.("Elige un estado", "error");
      if (nombre.length < 2) return window._showToast?.("Escribe el nombre del núcleo", "error");
      const btn = cuerpo.querySelector("#pn-guardar");
      btn.disabled = true; btn.textContent = "Creando…";
      try {
        await crearNucleo(nombre, estado);
        await resolverNucleoActivo({ forzar: true });
        establecerNucleoActivo({ nombre, estado });
        window._showToast?.(`Núcleo "${nombre}" creado y seleccionado`, "success");
        cerrar();
      } catch (err) {
        window._showToast?.("No se pudo crear: " + err.message, "error");
        btn.disabled = false; btn.textContent = "Crear";
      }
    };
    cuerpo.querySelector("#pn-guardar").addEventListener("click", guardarNucleo);
    cuerpo.querySelector("#pn-nombre").addEventListener("keydown", (e) => { if (e.key === "Enter") guardarNucleo(); });
  }

  async function renombrar(n) {
    const nuevo = await window._promptDialog("Nuevo nombre para este núcleo:", n.nombre, { titulo: "Cambiar nombre del núcleo" });
    if (!nuevo || !nuevo.trim() || nuevo.trim() === n.nombre) return;
    const cantidad = await contarDocumentosDeNucleo(n.nombre, n.estado).catch(() => null);
    const aviso = cantidad
      ? `Se van a actualizar ${cantidad} registro(s) de "${esc(n.nombre)}" (miembros, agrupaciones, piezas, partituras, flyers y eventos) para que pasen a "${esc(nuevo.trim())}".`
      : `¿Cambiar "${esc(n.nombre)}" a "${esc(nuevo.trim())}"?`;
    if (!(await window._confirmDialog(aviso, { titulo: "¿Confirmar el cambio de nombre?" }))) return;
    try {
      const { actualizados } = await renombrarNucleo(n.id, nuevo, n.estado);
      window._showToast?.(`Núcleo renombrado (${actualizados} registro(s) actualizados)`, "success");
      const eraActivo = mismo(activo, n);
      await resolverNucleoActivo({ forzar: true });
      if (eraActivo) establecerNucleoActivo({ nombre: nuevo.trim(), estado: n.estado });
      pintar();
    } catch (err) { window._showToast?.("No se pudo renombrar: " + err.message, "error"); }
  }

  async function eliminar(n) {
    const usuarios = await contarUsuariosEnNucleo(n.nombre, n.estado).catch(() => 0);
    if (usuarios > 0) {
      await window._alertDialog(`"${esc(n.nombre)}" todavía tiene ${usuarios} miembro(s). Pásalos a otro núcleo o elimínalos desde Miembros antes de borrar el núcleo.`, { titulo: "No se puede eliminar todavía" });
      return;
    }
    const otros = await contarDocumentosDeNucleo(n.nombre, n.estado).catch(() => 0);
    const aviso = otros
      ? `Vas a eliminar <strong>${esc(n.nombre)}</strong>. Tiene ${otros} registro(s) (agrupaciones, piezas, flyers o eventos) que dejarán de ser accesibles desde el sitio.`
      : `Vas a eliminar <strong>${esc(n.nombre)}</strong>. Esta acción no se puede deshacer.`;
    if (!(await window._confirmDialog(aviso, { titulo: "¿Eliminar núcleo?", peligroso: true, textoOk: "Sí, eliminar" }))) return;
    try {
      await eliminarNucleo(n.id, n.estado);
      window._showToast?.("Núcleo eliminado", "success");
      const eraActivo = mismo(activo, n);
      invalidarCacheSesionNucleos();
      await resolverNucleoActivo({ forzar: true });
      if (eraActivo && activo) establecerNucleoActivo(activo);
      else if (eraActivo) { pintarCabecera(); window.dispatchEvent(new CustomEvent("nucleo-activo-cambiado", { detail: null })); }
      pintar();
    } catch (err) { window._showToast?.("No se pudo eliminar: " + err.message, "error"); }
  }
}

// Punto de entrada que usa ui-manager.js en cada página.
export async function iniciarNucleoActivo() {
  await resolverNucleoActivo();
  pintarCabecera();
  montarGestorNucleos();
}

window.NucleoActivo = { resolver: resolverNucleoActivo, obtener: obtenerNucleoActivoSync, establecer: establecerNucleoActivo, etiqueta: etiquetaNucleo, esMulti: esMultiNucleo };
