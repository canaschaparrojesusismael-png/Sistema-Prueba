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
  // v4.0: se distingue por NOMBRE + ESTADO (antes solo por nombre y "Libertador" de
  // Táchira desaparecía detrás de "Libertador" de Cojedes).
  const lista = [...new Map(snap.docs.map((d) => [`${d.data().estado}|${d.data().nombre}`, { id: d.id, nombre: d.data().nombre, estado: d.data().estado }])).values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || (a.estado || "").localeCompare(b.estado || ""));
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
  const nombreLimpio = nombre.trim();
  // AGREGADO 2026-09-06 (Fase 4): como todo el sistema usa el NOMBRE del
  // núcleo como clave (usuarios, agrupaciones, piezas, partituras, flyers,
  // eventos — ver COLECCIONES_CON_NUCLEO más abajo), dos núcleos con el
  // mismo nombre serían indistinguibles entre sí para el resto del sitio:
  // sus usuarios y su repertorio se mezclarían en cualquier consulta que
  // filtre por "nucleo". No hay forma de arreglar eso después sin migrar
  // datos reales — mejor no dejar que pase. Se compara sin importar
  // mayúsculas/tildes de más, para agarrar también "Caracas " vs "caracas".
  const existentes = await getDocs(collection(db, "nucleos"));
  const yaExiste = existentes.docs.some(
    (d) => (d.data().nombre || "").trim().toLowerCase() === nombreLimpio.toLowerCase()
  );
  if (yaExiste) {
    const err = new Error(`Ya existe un núcleo llamado "${nombreLimpio}" (puede ser en otro estado). Elige un nombre distinto para evitar que se mezclen sus datos.`);
    err.categoria = "nombre_duplicado";
    throw err;
  }
  await addDoc(collection(db, "nucleos"), { nombre: nombreLimpio, estado });
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
// v4.0: las reglas de Firestore solo dejan listar "usuarios" si la consulta
// demuestra el alcance — por eso a esa colección se le suma el filtro de estado.
function consultaPorNucleo(nombreCol, nombreNucleo, estado) {
  const base = [collection(db, nombreCol), where("nucleo", "==", nombreNucleo)];
  if (nombreCol === "usuarios" && estado) base.push(where("estado", "==", estado));
  return query(...base);
}

export async function contarDocumentosDeNucleo(nombreNucleo, estado) {
  const conteos = await Promise.all(
    COLECCIONES_CON_NUCLEO.map((col) =>
      getDocs(consultaPorNucleo(col, nombreNucleo, estado)).then((s) => s.size).catch(() => 0)
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
      const snap = await getDocs(consultaPorNucleo(nombreCol, nombreViejo, estado));
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

export { invalidarCacheSesionNucleos };

// Cuenta cuántos usuarios tienen asignado este núcleo — para avisar antes de
// borrarlo (borrar el núcleo NO borra ni desvincula a esos usuarios, solo
// hace que el nombre deje de aparecer en los selectores para elegir de nuevo).
export async function contarUsuariosEnNucleo(nombreNucleo, estado) {
  const snap = await getDocs(consultaPorNucleo("usuarios", nombreNucleo, estado));
  return snap.size;
}
