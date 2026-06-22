/**
 * auth.js – Autenticación completa con Firebase (máscara de dominio)
 * Sistema Nacional de Orquestas
 * =====================================================================
 * - Importa auth y db desde firebase-init.js
 * - Concatena "@sistema.cma" al username para login y registro
 * - Soporta instancia secundaria para registro sin cerrar sesión
 * - Bloqueo de doble sesión (currentSessionId)
 * - Redirección a cambio de clave obligatorio
 */
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

const DOMINIO = "@sistema.cma";

// ===================== UTILIDADES =====================
function generarClave() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let clave = "";
  for (let i = 0; i < 8; i++) clave += chars.charAt(Math.floor(Math.random() * chars.length));
  return clave;
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

// ===================== API PÚBLICA =====================
window.Auth = {
  auth,
  db,

  // --- LOGIN ---
  async login(username, password, remember = false) {
    try {
      const email = username + DOMINIO;
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (!snap.exists()) {
        await signOut(auth);
        return { success: false, error: "Usuario no registrado." };
      }
      const data = snap.data();

      if (data.requiresPasswordChange) {
        sessionStorage.setItem("pendingPasswordChange", user.uid);
        return { success: true, requiresPasswordChange: true, uid: user.uid };
      }

      const sessionId = generarUUID();
      sessionStorage.setItem("currentSessionId", sessionId);
      if (remember) localStorage.setItem("currentSessionId", sessionId);

      await updateDoc(doc(db, "usuarios", user.uid), {
        isOnline: true,
        currentSessionId: sessionId,
        lastLogin: new Date().toISOString()
      });

      this.monitorSession(user.uid, sessionId);

      const sessionData = {
        id: user.uid, uid: user.uid, email: user.email,
        username: data.username || username,
        nombre: data.nombre,
        role: data.rango,
        firstName: data.nombre?.split(" ")[0] || "",
        lastName: data.nombre?.split(" ").slice(1).join(" ") || "",
        age: data.edad || 0,
        group: data.agrupacion || "",
        state: data.estado || "",
        nucleus: data.nucleo || "",
        permissions: (data.rango === "owner" || data.rango === "admin")
          ? ["view_profile", "access_panel", "edit_carousel", "manage_users"]
          : data.rango === "profesor"
            ? ["view_profile", "access_panel"]
            : ["view_profile"],
        loginTime: Date.now()
      };
      sessionStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      if (remember) localStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));

      return { success: true, user: sessionData };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- REGISTRO DE USUARIO (desde panel admin) ---
  async registerUser(username, nombre, rango, agrupacion) {
    const { secApp, secAuth } = getSecondaryAuthInstance();
    try {
      const clave = generarClave();
      const email = username + DOMINIO;
      const userCred = await createUserWithEmailAndPassword(secAuth, email, clave);
      const uid = userCred.user.uid;

      await setDoc(doc(db, "usuarios", uid), {
        username,
        nombre,
        rango,
        agrupacion,
        email,
        isOnline: false,
        currentSessionId: "",
        requiresPasswordChange: true,
        estado: "",
        nucleo: "",
        edad: 0,
        fechaCreacion: new Date().toISOString()
      });

      await signOut(secAuth);
      await deleteApp(secApp);
      return { success: true, clave, uid };
    } catch (err) {
      try { await deleteApp(secApp); } catch (e) {}
      return { success: false, error: err.message };
    }
  },

  // --- CAMBIAR CONTRASEÑA (primer login) ---
  async changePassword(newPassword) {
    if (!auth.currentUser) return { success: false, error: "Sin sesión." };
    try {
      await updatePassword(auth.currentUser, newPassword);
      await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
        requiresPasswordChange: false
      });
      sessionStorage.removeItem("pendingPasswordChange");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  // --- MONITOR DE DOBLE SESIÓN ---
  monitorSession(uid, currentSessionId) {
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.currentSessionId && d.currentSessionId !== currentSessionId) {
        alert("Se ha iniciado sesión en otro dispositivo. Esta sesión se cerrará.");
        this.logout();
      }
    });
    window._sessionUnsub = unsub;
  },

  // --- CERRAR SESIÓN ---
  async logout() {
    try {
      if (auth.currentUser) {
        await updateDoc(doc(db, "usuarios", auth.currentUser.uid), {
          isOnline: false,
          currentSessionId: ""
        });
        await signOut(auth);
      }
    } catch (e) {}
    if (window._sessionUnsub) {
      window._sessionUnsub();
      window._sessionUnsub = null;
    }
    localStorage.removeItem("sistemaOrquestas_session");
    sessionStorage.removeItem("sistemaOrquestas_session");
    localStorage.removeItem("currentSessionId");
    sessionStorage.removeItem("currentSessionId");
    window.location.href = "index.html";
  },

  // --- OBTENER SESIÓN ACTUAL ---
  getSession() {
    const raw = sessionStorage.getItem("sistemaOrquestas_session") ||
                localStorage.getItem("sistemaOrquestas_session");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  // --- VERIFICAR PERMISO ---
  hasPermission(perm) {
    const s = this.getSession();
    return s ? s.permissions.includes(perm) : false;
  },

  // --- OBTENER ROL ---
  getRole() {
    const s = this.getSession();
    return s ? s.role : null;
  },

  // --- LISTENER DE CAMBIO DE AUTENTICACIÓN ---
  onAuthChange(cb) {
    return onAuthStateChanged(auth, cb);
  }
};

// ===================== REACTIVAR MONITOR AL RECARGAR =====================
(() => {
  const session = window.Auth.getSession();
  const currentSessionId = sessionStorage.getItem("currentSessionId") || localStorage.getItem("currentSessionId");
  if (session && currentSessionId) {
    window.Auth.monitorSession(session.uid, currentSessionId);
  }
})();
