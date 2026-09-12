import { auth, db, firebaseConfig } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getAuth as getSecondaryAuthObj } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { initializeApp as initSecondaryApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { backendAPI } from "./backend-api.js";

const DOMINIO = "";

// ==================== JERARQUÍA DE ROLES ====================
// AGREGADO 2026-09-06: cada rol ahora tiene un ícono (FontAwesome) además
// de su etiqueta — así cualquier pantalla que muestre roles (Configuración,
// Miembros, etc.) puede usar el mismo ícono en vez de inventar uno propio
// cada vez, y si el día de mañana cambia, se cambia en un solo lugar.
const ROLES = {
  owner_supremo: {
    label: "Owner Supremo",
    icon: "fa-solid fa-crown",
    level: 0,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","manage_all_nucleos","delete_any","debug_mode"]
  },
  director_nacional: {
    label: "Director Nacional",
    icon: "fa-solid fa-flag",
    level: 1,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","view_all_nucleos"]
  },
  director_regional: {
    label: "Director Regional",
    icon: "fa-solid fa-map",
    level: 2,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","view_region"]
  },
  director_nucleo: {
    label: "Director de Núcleo",
    icon: "fa-solid fa-building-columns",
    level: 3,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","manage_nucleo"]
  },
  admin: {
    label: "Administrador",
    icon: "fa-solid fa-user-gear",
    level: 4,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users"]
  },
  profesor: {
    label: "Profesor",
    icon: "fa-solid fa-chalkboard-user",
    level: 5,
    permissions: ["view_profile","access_panel","edit_carousel"]
  },
  estudiante: {
    label: "Estudiante",
    icon: "fa-solid fa-graduation-cap",
    level: 6,
    permissions: ["view_profile"]
  }
};

function generarClaveSegura() {
  const mayus = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minus = "abcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const simb = "!@#$%&*";
  const todos = mayus + minus + nums + simb;
  let clave = "";
  clave += mayus[Math.floor(Math.random() * mayus.length)];
  clave += minus[Math.floor(Math.random() * minus.length)];
  clave += nums[Math.floor(Math.random() * nums.length)];
  clave += simb[Math.floor(Math.random() * simb.length)];
  for (let i = 4; i < 12; i++) {
    clave += todos[Math.floor(Math.random() * todos.length)];
  }
  return clave.split("").sort(() => Math.random() - 0.5).join("");
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getSecondaryAuthInstance() {
  const secApp = initSecondaryApp(firebaseConfig, "secondary" + Date.now());
  const secAuth = getSecondaryAuthObj(secApp);
  return { secApp, secAuth };
}

// v3.0 — AGREGADO: los toasts ahora se apilan en una sola columna en vez de
// aparecer todos en el mismo punto fijo de la pantalla y superponerse si
// hay más de uno seguido (ej. guardar un flyer justo cuando falla otra
// carga). El contenedor se crea una sola vez y cada toast entra/sale con
// su propia animación.
function _toastStack() {
  let stack = document.getElementById("toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
  }
  return stack;
}
const _TOAST_ICONS = { info: "fa-circle-info", success: "fa-circle-check", error: "fa-circle-exclamation", warning: "fa-triangle-exclamation" };
window._showToast = function (mensaje, tipo = "info") {
  const stack = _toastStack();
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.innerHTML = `<i class="fa-solid ${_TOAST_ICONS[tipo] || _TOAST_ICONS.info}" aria-hidden="true"></i><span>${window._escapeHtml ? window._escapeHtml(mensaje) : mensaje}</span>`;
  stack.appendChild(toast);
  setTimeout(() => { toast.classList.add("toast-saliendo"); setTimeout(() => toast.remove(), 250); }, 3500);
};

// v3.0 — AGREGADO: iniciales + color de avatar reutilizables en toda la
// app (antes Miembros, la barra de usuario y Configuración calculaban esto
// cada uno por su cuenta con lógica levemente distinta).
window._iniciales = function (nombre) {
  if (!nombre) return "?";
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const ini = partes.length === 1 ? partes[0][0] : partes[0][0] + partes[partes.length - 1][0];
  return ini.toUpperCase();
};
// Un color fijo por rol (no aleatorio) para que el mismo rol se reconozca
// de un vistazo en Miembros/barra superior sin tener que leer la etiqueta.
const _COLOR_ROL = {
  owner_supremo: "#c99a2e",
  director_nacional: "#4138A9",
  director_regional: "#5b52c9",
  director_nucleo: "#3a8fd6",
  admin: "#3aa6a0",
  profesor: "#c1121f",
  estudiante: "#6b7280"
};
window._colorPorRol = function (rol) { return _COLOR_ROL[rol] || "#4138A9"; };

// v3.0 — AGREGADO: mismo bloque de "3 puntitos cargando" que ya usaban el
// carrusel/flyers/calendario, ahora como una función para poder ponerlo
// también donde antes solo había texto plano "Cargando…". Por defecto usa
// el mismo posicionamiento absoluto "de esquina" que ya usan carrusel/
// flyers (pensado para vivir dentro de un contenedor position:relative);
// pasar `inline: true` cuando se necesita que fluya como texto normal
// (un botón, un mensaje de chat, un div centrado con flexbox).
window._loaderPuntosHTML = function (sobreClaro = false, inline = false) {
  return `<div class="loader-puntos${sobreClaro ? " sobre-claro" : ""}${inline ? " inline" : ""}" role="status" aria-label="Cargando"><span></span><span></span><span></span></div>`;
};

// v3.0 — AGREGADO: reemplazo estilizado de confirm()/alert()/prompt() del
// navegador, para que ninguna ventana nativa rompa la estética del sitio.
// Cada función devuelve una Promise, igual que se usaría confirm()/prompt()
// de forma síncrona pero sin bloquear el hilo del navegador.
function _dialogBase(tipoIcono, titulo, mensaje, botones, inputConfig) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay dialogo-overlay";
    overlay.style.zIndex = "10500";
    overlay.style.display = "flex";
    const iconos = { pregunta: "fa-circle-question", alerta: "fa-triangle-exclamation", peligro: "fa-trash-can", info: "fa-circle-info" };
    overlay.innerHTML = `
      <div class="modal-content dialogo-content" role="alertdialog" aria-modal="true" aria-labelledby="dlg-titulo">
        <div class="dialogo-icono dialogo-icono-${tipoIcono}"><i class="fa-solid ${iconos[tipoIcono] || iconos.info}" aria-hidden="true"></i></div>
        <h3 id="dlg-titulo">${titulo}</h3>
        <p class="dialogo-mensaje">${mensaje}</p>
        ${inputConfig ? `<input type="${inputConfig.type || "text"}" class="modal-input dialogo-input" value="${window._escapeHtml ? window._escapeHtml(inputConfig.valor || "") : (inputConfig.valor || "")}" placeholder="${inputConfig.placeholder || ""}">` : ""}
        <div class="dialogo-botones"></div>
      </div>`;
    document.body.appendChild(overlay);
    const cerrar = (valor) => { overlay.remove(); resolve(valor); };
    const botonesWrap = overlay.querySelector(".dialogo-botones");
    botones.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${b.clase || "btn-cerrar"}`;
      btn.textContent = b.texto;
      btn.onclick = () => cerrar(inputConfig ? (b.valor !== false ? (overlay.querySelector(".dialogo-input")?.value ?? "") : null) : b.valor);
      botonesWrap.appendChild(btn);
    });
    const inputEl = overlay.querySelector(".dialogo-input");
    if (inputEl) { inputEl.focus(); inputEl.select(); inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") botonesWrap.lastElementChild.click(); if (e.key === "Escape") botonesWrap.firstElementChild.click(); }); }
    else { overlay.querySelector(".dialogo-botones").lastElementChild?.focus(); }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(inputConfig ? null : false); });
  });
}
window._confirmDialog = function (mensaje, { titulo = "Confirmar", peligroso = false, textoOk = "Confirmar", textoCancelar = "Cancelar" } = {}) {
  return _dialogBase(peligroso ? "peligro" : "pregunta", titulo, mensaje, [
    { texto: textoCancelar, clase: "btn-cerrar", valor: false },
    { texto: textoOk, clase: "btn-submit", valor: true }
  ]);
};
window._alertDialog = function (mensaje, { titulo = "Aviso", tipo = "alerta" } = {}) {
  return _dialogBase(tipo, titulo, mensaje, [{ texto: "Entendido", clase: "btn-submit", valor: true }]);
};
window._promptDialog = function (mensaje, valorInicial = "", { titulo = "Escribí un valor", placeholder = "" } = {}) {
  return _dialogBase("pregunta", titulo, mensaje, [
    { texto: "Cancelar", clase: "btn-cerrar" },
    { texto: "Aceptar", clase: "btn-submit" }
  ], { valor: valorInicial, placeholder });
};

// Escapa texto antes de insertarlo con innerHTML. Cualquier campo que
// escribe una persona (nombre, agrupación, título de una pieza, texto de
// un flyer...) puede terminar mostrado en la pantalla de OTRA persona con
// más privilegios (un admin viendo la lista de Miembros, por ejemplo). Sin
// esto, alguien podría escribir algo como <img src=x onerror=...> en su
// propio nombre y ese código se ejecutaría en el navegador de quien lo mire.
window._escapeHtml = function (texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

window.Auth = {
  auth,
  db,
  ROLES,
  generarClaveSegura,

  canView(targetRole) {
    const session = this.getSession();
    if (!session) return false;
    const myLevel = ROLES[session.role]?.level ?? 99;
    const targetLevel = ROLES[targetRole]?.level ?? 99;
    if (targetRole === "owner_supremo" && session.role !== "owner_supremo") return false;
    return myLevel <= targetLevel;
  },

  canEdit(targetRole) {
    const session = this.getSession();
    if (!session) return false;
    const myLevel = ROLES[session.role]?.level ?? 99;
    const targetLevel = ROLES[targetRole]?.level ?? 99;
    if (targetRole === "owner_supremo" && session.role !== "owner_supremo") return false;
    return myLevel < targetLevel;
  },

  canManageNucleo(targetNucleo) {
    const session = this.getSession();
    if (!session) return false;
    if (["owner_supremo","director_nacional"].includes(session.role)) return true;
    if (session.role === "director_regional") return session.state === targetNucleo?.estado;
    if (["director_nucleo","admin"].includes(session.role)) return session.nucleus === targetNucleo;
    return false;
  },

  // ---------- AUTENTICACIÓN ----------
  async login(username, password, remember = false) {
    try {
      let email = username.trim();
      if (!email.includes("@")) {
        window._showToast("Debes ingresar un correo electrónico válido", "error");
        return { success: false, error: "Correo inválido" };
      }
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (!snap.exists()) { await signOut(auth); return { success: false, error: "Usuario no registrado." }; }
      const data = snap.data();

      if (data.cuentaActiva === false) {
        await signOut(auth);
        return { success: false, error: "Esta cuenta ha sido desactivada. Contacta al administrador." };
      }

      const sessionId = generarUUID();
      sessionStorage.setItem("currentSessionId", sessionId);
      if (remember) localStorage.setItem("currentSessionId", sessionId);
      try {
        await updateDoc(doc(db, "usuarios", user.uid), {
          isOnline: true,
          currentSessionId: sessionId,
          lastLogin: new Date().toISOString()
        });
        this.monitorSession(user.uid, sessionId);
      } catch (errEstado) {
        // Esto NO debe bloquear el login: si falla, solo perdés el indicador de
        // "en línea" y el cierre de sesión remoto, pero podés entrar igual.
        console.error(
          "⚠️ No se pudo marcar la sesión como 'en línea' (revisá que publicaste " +
          "las reglas de Firestore más recientes en Firebase Console). Detalle:",
          errEstado
        );
      }

      const sessionData = {
        id: user.uid, uid: user.uid, email: user.email,
        username: data.username || username, nombre: data.nombre,
        role: data.rango, roleLevel: ROLES[data.rango]?.level ?? 99,
        subRole: data.subRole || "",
        firstName: data.nombre?.split(" ")[0] || "",
        lastName: data.nombre?.split(" ").slice(1).join(" ") || "",
        age: data.edad || 0, group: data.agrupacion || "",
        state: data.estado || "", nucleus: data.nucleo || "",
        permissions: ROLES[data.rango]?.permissions || ["view_profile"],
        requiresPasswordChange: data.requiresPasswordChange || false,
        // v3.0: guardamos el lastLogin ANTERIOR (el que tenía el documento
        // antes de que esta misma función lo pise más abajo) para poder
        // mostrar "Tu última sesión fue el..." en Configuración.
        previousLogin: data.lastLogin || null,
        fechaCreacion: data.fechaCreacion || null,
        loginTime: Date.now()
      };
      sessionStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      if (remember) localStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      window.dispatchEvent(new CustomEvent('auth-ready', { detail: sessionData }));
      return { success: true, user: sessionData };
    } catch (err) { return { success: false, error: err.message }; }
  },

  async registerUser(username, nombre, rango, agrupacion, estado, nucleo, edad = 0) {
    try {
      const clave = generarClaveSegura();
      // Antes: Cloud Function (requería plan Blaze). Ahora: backend en Vercel.
      const resultado = await backendAPI.crearUsuario({
        email: username.trim(),
        password: clave,
        nombre,
        rango,
        agrupacion: agrupacion || "",
        estado: estado || "",
        nucleo: nucleo || "",
        edad: edad || 0
      });
      if (resultado.success) {
        return { success: true, clave, uid: resultado.uid };
      } else {
        return { success: false, error: resultado.error || "Error desconocido" };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // CORREGIDO 2026-09-06: se eliminó el autoservicio de "cambiar mi propia
  // contraseña" — a pedido, ya no tiene sentido en este sistema (las
  // contraseñas las asigna/restablece un director u owner_supremo desde
  // Miembros). Antes esta función vivía acá y la llamaba únicamente el
  // botón "Guardar contraseña" de Configuración, que también se quitó.

  monitorSession(uid, currentSessionId) {
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.currentSessionId && d.currentSessionId !== currentSessionId) {
        window._showToast("Sesión iniciada en otro dispositivo. Cerrando...", "error");
        this.logout();
      }
    });
    window._sessionUnsub = unsub;
  },

  async logout() {
    try {
      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { isOnline: false, currentSessionId: "" });
        } catch (errEstado) {
          console.error("⚠️ No se pudo marcar la sesión como 'fuera de línea' (no bloquea el cierre de sesión):", errEstado);
        }
        await signOut(auth);
      }
    } catch (e) {}
    if (window._sessionUnsub) { window._sessionUnsub(); window._sessionUnsub = null; }
    localStorage.removeItem("sistemaOrquestas_session"); sessionStorage.removeItem("sistemaOrquestas_session");
    localStorage.removeItem("currentSessionId"); sessionStorage.removeItem("currentSessionId");
    window.location.href = "index.html";
  },

  // ==================== VISTA PREVIA (solo Owner Supremo) ====================
  // Cambia SOLO lo que ve este navegador (rol/permisos/núcleo mostrados).
  // NO toca el documento real en Firestore, así que no hay riesgo de quedar
  // bloqueado: las reglas de seguridad siguen validando el usuario REAL.
  setPreviewOverride(role, nucleus, estado) {
    const real = this.getRealSession();
    if (!real || real.role !== "owner_supremo") return false;
    const perms = ROLES[role]?.permissions || ["view_profile"];
    sessionStorage.setItem("sistemaOrquestas_preview", JSON.stringify({ role, nucleus: nucleus || "", state: estado || "", permissions: perms }));
    return true;
  },
  clearPreviewOverride() { sessionStorage.removeItem("sistemaOrquestas_preview"); },
  getPreviewOverride() {
    try { return JSON.parse(sessionStorage.getItem("sistemaOrquestas_preview")); } catch { return null; }
  },
  getRealSession() {
    const raw = sessionStorage.getItem("sistemaOrquestas_session") || localStorage.getItem("sistemaOrquestas_session");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  getSession() {
    const real = this.getRealSession();
    if (!real) return null;
    const preview = real.role === "owner_supremo" ? this.getPreviewOverride() : null;
    if (!preview) return real;
    // Sesión "de mentira" para la interfaz: mismo usuario, rol/núcleo simulados.
    return { ...real, role: preview.role, nucleus: preview.nucleus, state: preview.state, permissions: preview.permissions, _previewReal: real.role };
  },

  checkPermission(perm) { const s = this.getSession(); return s ? s.permissions.includes(perm) : false; },
  getRole() { const s = this.getSession(); return s ? s.role : null; },
  onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
};

(() => {
  const session = window.Auth.getSession();
  const currentSessionId = sessionStorage.getItem("currentSessionId") || localStorage.getItem("currentSessionId");
  if (session && currentSessionId) window.Auth.monitorSession(session.uid, currentSessionId);
  window.dispatchEvent(new CustomEvent('auth-ready', { detail: session }));
})();
