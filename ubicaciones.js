import { db } from "./firebase-init.js";
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

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

// ---------------------------------------------------------------
// Caché de sesión (sessionStorage): a diferencia del Map de arriba —que
// se vacía cada vez que se navega a otra página, porque este es un sitio
// de varias páginas y no una SPA—, esto SÍ sobrevive al navegar entre
// panel.html / piezas.html / miembros.html dentro del mismo login.
// Antes, cada página volvía a pedirle la lista completa de núcleos a
// Firestore desde cero, aunque no hubiera cambiado nada. Con esto, solo
// se vuelve a pedir cuando pasan 5 minutos o cuando alguien de verdad
// crea/renombra/elimina un núcleo (ver invalidarCacheSesionNucleos).
// ---------------------------------------------------------------
const TTL_CACHE_NUCLEOS_MS = 5 * 60 * 1000;

function leerCacheSesion(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { valor, expira } = JSON.parse(raw);
    if (Date.now() > expira) { sessionStorage.removeItem(key); return null; }
    return valor;
  } catch { return null; }
}
function guardarCacheSesion(key, valor) {
  try { sessionStorage.setItem(key, JSON.stringify({ valor, expira: Date.now() + TTL_CACHE_NUCLEOS_MS })); } catch { /* si sessionStorage está lleno/deshabilitado, seguimos sin caché, no rompe nada */ }
}
function invalidarCacheSesionNucleos() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("cache_nucleos_"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* no-op */ }
}

// Todos los núcleos del sistema, sin filtrar por estado (lo que usan
// panel.html y piezas.html para el selector de "Ver otro núcleo").
// Antes cada página tenía su propia copia casi idéntica de este código.
export async function cargarTodosLosNucleos({ forzar = false } = {}) {
  const cacheKey = "cache_nucleos_todos";
  if (!forzar) {
    const cache = leerCacheSesion(cacheKey);
    if (cache) return cache;
  }
  const snap = await getDocs(collection(db, "nucleos"));
  const lista = [...new Map(snap.docs.map((d) => [d.data().nombre, { nombre: d.data().nombre, estado: d.data().estado }])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  guardarCacheSesion(cacheKey, lista);
  return lista;
}

// Devuelve [{id, nombre}] — el id hace falta para poder renombrar/eliminar.
export async function cargarNucleosConIdPorEstado(estado, { forzar = false } = {}) {
  if (!estado) return [];
  if (!forzar && cacheNucleosPorEstado.has(estado)) return cacheNucleosPorEstado.get(estado);
  const cacheKey = `cache_nucleos_estado_${estado}`;
  if (!forzar) {
    const cache = leerCacheSesion(cacheKey);
    if (cache) { cacheNucleosPorEstado.set(estado, cache); return cache; }
  }
  const snap = await getDocs(query(collection(db, "nucleos"), where("estado", "==", estado)));
  const lista = snap.docs
    .map(d => ({ id: d.id, nombre: d.data().nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  cacheNucleosPorEstado.set(estado, lista);
  guardarCacheSesion(cacheKey, lista);
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
  invalidarCacheSesionNucleos();
}

// Todas las colecciones donde el núcleo se guarda como texto plano (no un
// ID). Si esta lista queda desactualizada porque se agrega una colección
// nueva con campo "nucleo" y no se agrega acá, renombrar seguirá
// funcionando para las demás, pero esa colección nueva quedará huérfana —
// hay que recordar sumarla acá cuando se cree.
const COLECCIONES_CON_NUCLEO = ["usuarios", "agrupaciones", "piezas", "partituras", "flyers", "eventos"];

// Cuenta cuántos documentos en total (de todas las colecciones de arriba)
// quedarían huérfanos si se renombra este núcleo sin actualizarlos en
// cascada — se usa para avisar antes de confirmar el renombre.
export async function contarDocumentosDeNucleo(nombreNucleo) {
  const conteos = await Promise.all(
    COLECCIONES_CON_NUCLEO.map((col) =>
      getDocs(query(collection(db, col), where("nucleo", "==", nombreNucleo))).then((s) => s.size).catch(() => 0)
    )
  );
  return conteos.reduce((a, b) => a + b, 0);
}

export async function renombrarNucleo(id, nuevoNombre, estado) {
  const nombreLimpio = nuevoNombre.trim();
  // Hace falta el nombre VIEJO antes de pisarlo, para poder encontrar y
  // actualizar en cascada todo lo que ya apuntaba a él.
  const refNucleo = doc(db, "nucleos", id);
  const snapActual = await getDoc(refNucleo);
  const nombreViejo = snapActual.exists() ? snapActual.data().nombre : null;

  await updateDoc(refNucleo, { nombre: nombreLimpio });

  // CORREGIDO 2026-09-01: esto antes SOLO renombraba el documento maestro
  // en /nucleos/. Pero usuarios, agrupaciones, piezas, partituras, flyers
  // y eventos guardan el NOMBRE del núcleo como texto plano (no un ID) —
  // así que si nadie actualiza esos documentos, quedan huérfanos: siguen
  // existiendo en Firestore, pero con un nombre que ya no aparece en
  // ningún selector ni filtro del sitio (como si hubieran desaparecido).
  // Acá actualizamos en cascada TODAS las colecciones que usan "nucleo"
  // como clave, en lotes (Firestore permite hasta 500 escrituras por batch,
  // usamos 400 para dejar margen).
  let actualizados = 0;
  if (nombreViejo && nombreViejo !== nombreLimpio) {
    const refsAActualizar = [];
    for (const nombreCol of COLECCIONES_CON_NUCLEO) {
      const snap = await getDocs(query(collection(db, nombreCol), where("nucleo", "==", nombreViejo)));
      snap.docs.forEach((d) => refsAActualizar.push(d.ref));
    }
    const TAMANO_LOTE = 400;
    for (let i = 0; i < refsAActualizar.length; i += TAMANO_LOTE) {
      const lote = writeBatch(db);
      refsAActualizar.slice(i, i + TAMANO_LOTE).forEach((ref) => lote.update(ref, { nucleo: nombreLimpio }));
      await lote.commit();
    }
    actualizados = refsAActualizar.length;
  }

  cacheNucleosPorEstado.delete(estado);
  invalidarCacheSesionNucleos();
  return { actualizados };
}

export async function eliminarNucleo(id, estado) {
  await deleteDoc(doc(db, "nucleos", id));
  cacheNucleosPorEstado.delete(estado);
  invalidarCacheSesionNucleos();
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
          <button type="button" id="ubicacion-btn-reintentar-nucleo" class="btn-config-mini" title="Reintentar" style="flex-shrink:0;display:none;background:#c1121f;"><i class="fa-solid fa-rotate-right"></i> Reintentar</button>
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
  const btnReintentar = document.getElementById("ubicacion-btn-reintentar-nucleo");

  async function refrescarNucleos(estado, preseleccionar = "") {
    btnReintentar.style.display = "none";
    if (!estado) { selNucleo.disabled = true; selNucleo.innerHTML = `<option value="">Elegí un estado primero</option>`; return; }
    selNucleo.disabled = true;
    selNucleo.innerHTML = `<option value="">Cargando…</option>`;
    try {
      // forzar:true a propósito: esta pantalla es justo donde se administran
      // los núcleos, así que priorizamos datos frescos sobre velocidad.
      const lista = await cargarNucleosConIdPorEstado(estado, { forzar: true });
      selNucleo.innerHTML = lista.length
        ? lista.map(n => `<option value="${n.nombre}" data-id="${n.id}" ${n.nombre === preseleccionar ? "selected" : ""}>${n.nombre}</option>`).join("")
        : `<option value="">(sin núcleos en este estado todavía)</option>`;
      selNucleo.disabled = false;
    } catch (err) {
      console.error("No se pudo cargar la lista de núcleos:", err);
      selNucleo.innerHTML = `<option value="">⚠️ No se pudo cargar — tocá "Reintentar"</option>`;
      selNucleo.disabled = true;
      window._showToast?.("No se pudieron cargar los núcleos. Revisá tu conexión.", "error");
      btnReintentar.style.display = "inline-flex";
    }
  }

  if (estadoInicial && !soloEstado) refrescarNucleos(estadoInicial, nucleoInicial);

  selEstado.addEventListener("change", () => {
    formCrear.style.display = "none";
    if (!soloEstado) refrescarNucleos(selEstado.value);
  });

  btnReintentar.addEventListener("click", () => refrescarNucleos(selEstado.value, selNucleo.value));

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
    // CORREGIDO 2026-09-01: avisamos cuántos registros (usuarios, piezas,
    // eventos, etc.) se van a actualizar, para que quien renombra sepa el
    // alcance real de la acción antes de confirmarla.
    const cantidad = await contarDocumentosDeNucleo(opt.value).catch(() => null);
    const aviso = cantidad
      ? `Esto va a actualizar ${cantidad} registro(s) que ya pertenecen a "${opt.value}" (usuarios, agrupaciones, piezas, partituras, flyers y eventos) para que pasen a "${nuevoNombre.trim()}". ¿Confirmar?`
      : `¿Renombrar "${opt.value}" a "${nuevoNombre.trim()}"?`;
    if (!confirm(aviso)) return;
    try {
      const { actualizados } = await renombrarNucleo(id, nuevoNombre, selEstado.value);
      window._showToast?.(`Núcleo renombrado (${actualizados} registro(s) actualizados)`, "success");
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
