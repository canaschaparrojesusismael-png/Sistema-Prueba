// Lógica de agrupaciones (v4.0). Las piezas y partituras ahora apuntan a la agrupación por su ID
// (antes por nombre, con un chequeo global de nombres únicos que las reglas nuevas impiden).
import { db } from "./firebase-init.js";
import {
  collection, query, where, getDocs, addDoc, doc, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Un lote de Firestore admite 500 operaciones; se parte en tandas de 400.
export async function aplicarEnLotes(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const lote = writeBatch(db);
    ops.slice(i, i + 400).forEach(([tipo, ref, datos]) => (tipo === "update" ? lote.update(ref, datos) : lote.delete(ref)));
    await lote.commit();
  }
}
const consultaUsuarios = (nucleo, estado, extra = []) =>
  query(collection(db, "usuarios"), where("nucleo", "==", nucleo), ...(estado ? [where("estado", "==", estado)] : []), ...extra);

export function validarNombreAgrupacion(nombre, existentes, idActual = null) {
  const n = String(nombre || "").trim();
  if (n.length < 2) return "Escribe un nombre de al menos 2 letras.";
  if (n.length > 80) return "El nombre es demasiado largo (máximo 80 caracteres).";
  if (existentes.some((a) => a.id !== idActual && a.nombre.toLowerCase() === n.toLowerCase())) return "Ya existe una agrupación con ese nombre en este núcleo.";
  return "";
}

export async function crearAgrupacion({ nombre, nucleo, estado, uid }) {
  return addDoc(collection(db, "agrupaciones"), { nombre: nombre.trim(), nucleo, estado: estado || "", creadoPor: uid, fechaCreacion: new Date().toISOString() });
}

export async function resumenAgrupacion({ id, nombre, nucleo, estado }) {
  const [piezas, parts, usuarios, eventos] = await Promise.all([
    getDocs(query(collection(db, "piezas"), where("nucleo", "==", nucleo), where("agrupacionId", "==", id))),
    getDocs(query(collection(db, "partituras"), where("nucleo", "==", nucleo), where("agrupacionId", "==", id))),
    getDocs(consultaUsuarios(nucleo, estado, [where("agrupacion", "==", nombre)])),
    getDocs(query(collection(db, "eventos"), where("nucleo", "==", nucleo))),
  ]);
  const token = "agr:" + nombre;
  return { piezas, parts, usuarios: usuarios.size, eventos: eventos.docs.filter((d) => (d.data().audiencia || []).includes(token)) };
}

export async function renombrarAgrupacion({ id, viejo, nuevo, nucleo, estado }) {
  const r = await resumenAgrupacion({ id, nombre: viejo, nucleo, estado });
  const ops = [["update", doc(db, "agrupaciones", id), { nombre: nuevo }]];
  r.piezas.docs.forEach((d) => ops.push(["update", d.ref, { agrupacion: nuevo }]));
  const us = await getDocs(consultaUsuarios(nucleo, estado, [where("agrupacion", "==", viejo)]));
  us.docs.forEach((d) => ops.push(["update", d.ref, { agrupacion: nuevo }]));
  r.eventos.forEach((d) => ops.push(["update", d.ref, { audiencia: d.data().audiencia.map((t) => (t === "agr:" + viejo ? "agr:" + nuevo : t)) }]));
  await aplicarEnLotes(ops);
  return ops.length - 1;
}

// Devuelve { bloqueada: true, usuarios } si todavía hay personas asignadas.
export async function eliminarAgrupacion({ id, nombre, nucleo, estado }) {
  const r = await resumenAgrupacion({ id, nombre, nucleo, estado });
  if (r.usuarios > 0) return { bloqueada: true, usuarios: r.usuarios };
  const ops = [];
  r.parts.docs.forEach((d) => ops.push(["delete", d.ref]));
  r.piezas.docs.forEach((d) => ops.push(["delete", d.ref]));
  r.eventos.forEach((d) => ops.push(["update", d.ref, { audiencia: d.data().audiencia.filter((t) => t !== "agr:" + nombre) }]));
  ops.push(["delete", doc(db, "agrupaciones", id)]);
  await aplicarEnLotes(ops);
  return { bloqueada: false, piezas: r.piezas.size, partituras: r.parts.size, eventosAfectados: r.eventos.length };
}
