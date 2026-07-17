import { auth, db, firebaseConfig } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getAuth as getSecondaryAuthObj } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { initializeApp as initSecondaryApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";

const DOMINIO = "";

// ==================== JERARQUÍA DE ROLES ====================
const ROLES = {
  owner_supremo: {
    label: "Owner Supremo",
    level: 0,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","manage_all_nucleos","delete_any","debug_mode"]
  },
  director_nacional: {
    label: "Director Nacional",
    level: 1,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","view_all_nucleos"]
  },
  director_regional: {
    label: "Director Regional",
    level: 2,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","view_region"]
  },
  director_nucleo: {
    label: "Director de Núcleo",
    level: 3,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users","manage_nucleo"]
  },
  admin: {
    label: "Administrador",
    level: 4,
    permissions: ["view_profile","access_panel","edit_carousel","manage_users"]
  },
  profesor: {
    label: "Profesor",
    level: 5,
    permissions: ["view_profile","access_panel","edit_carousel"]
  },
  estudiante: {
    label: "Estudiante",
    level: 6,
    permissions: ["view_profile"]
  }
};

function generarClave() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let clave = "";
  for (let i = 0; i < 8; i++) clave += chars.charAt(Math.floor(Math.random() * chars.length));
  return clave;
}

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

window._showToast = function (mensaje, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
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

  // ---------- AUTENTICACIÓN (ya sin bloqueo por cambio de contraseña) ----------
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

      // --- ELIMINADO: redirección automática a cambiar-clave.html ---
      // Ahora el usuario puede iniciar sesión normalmente aunque requiresPasswordChange sea true.
      // El administrador forzará el cambio de contraseña mediante el botón 🔑 en el panel de miembros.

      const sessionId = generarUUID();
      sessionStorage.setItem("currentSessionId", sessionId);
      if (remember) localStorage.setItem("currentSessionId", sessionId);
      await updateDoc(doc(db, "usuarios", user.uid), { isOnline: true, currentSessionId: sessionId, lastLogin: new Date().toISOString() });
      this.monitorSession(user.uid, sessionId);
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
        loginTime: Date.now()
      };
      sessionStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      if (remember) localStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      window.dispatchEvent(new CustomEvent('auth-ready', { detail: sessionData }));
      return { success: true, user: sessionData };
    } catch (err) { return { success: false, error: err.message }; }
  },

  async registerUser(username, nombre, rango, agrupacion, estado, nucleo, edad = 0) {
    const { secApp, secAuth } = getSecondaryAuthInstance();
    try {
      const clave = generarClave();
      let email = username.trim();
      if (!email.includes("@")) {
        window._showToast("El email debe ser válido", "error");
        return { success: false, error: "Email inválido" };
      }
      const userCred = await createUserWithEmailAndPassword(secAuth, email, clave);
      const uid = userCred.user.uid;
      await setDoc(doc(db, "usuarios", uid), {
        username, nombre, rango, agrupacion, estado, nucleo, email,
        isOnline: false, currentSessionId: "", requiresPasswordChange: false, // Ya no se fuerza el cambio
        edad: edad || 0, fechaCreacion: new Date().toISOString()
      });
      await signOut(secAuth); await deleteApp(secApp);
      return { success: true, clave, uid };
    } catch (err) { try { await deleteApp(secApp); } catch (e) {} return { success: false, error: err.message }; }
  },

  async changePassword(newPassword) {
    if (!auth.currentUser) return { success: false, error: "Sin sesión." };
    try {
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { requiresPasswordChange: false });
      sessionStorage.removeItem("pendingPasswordChange");
      return { success: true };
    } catch (err) { return { success: false, error: err.message }; }
  },

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
    try { if (auth.currentUser) { await updateDoc(doc(db, "usuarios", auth.currentUser.uid), { isOnline: false, currentSessionId: "" }); await signOut(auth); } } catch (e) {}
    if (window._sessionUnsub) { window._sessionUnsub(); window._sessionUnsub = null; }
    localStorage.removeItem("sistemaOrquestas_session"); sessionStorage.removeItem("sistemaOrquestas_session");
    localStorage.removeItem("currentSessionId"); sessionStorage.removeItem("currentSessionId");
    window.location.href = "index.html";
  },

  getSession() {
    const raw = sessionStorage.getItem("sistemaOrquestas_session") || localStorage.getItem("sistemaOrquestas_session");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  checkPermission(perm) { const s = this.getSession(); return s ? s.permissions.includes(perm) : false; },
  getRole() { const s = this.getSession(); return s ? s.role : null; },
  onAuthChange(cb) { return onAuthStateChanged(auth, cb); }
};

// Al recargar, disparar evento si hay sesión
(() => {
  const session = window.Auth.getSession();
  const currentSessionId = sessionStorage.getItem("currentSessionId") || localStorage.getItem("currentSessionId");
  if (session && currentSessionId) window.Auth.monitorSession(session.uid, currentSessionId);
  window.dispatchEvent(new CustomEvent('auth-ready', { detail: session }));
})();
