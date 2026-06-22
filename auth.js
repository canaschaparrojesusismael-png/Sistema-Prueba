/**
 * auth.js – Firebase Modular + Soporte de instancia secundaria
 */

import { initializeApp, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========== CONFIGURACIÓN ==========
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "sistema-orquestas.firebaseapp.com",
  projectId: "sistema-orquestas",
  storageBucket: "sistema-orquestas.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxx"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========== UTILIDADES ==========
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

// Instancia secundaria para registro sin cerrar sesión
function getSecondaryAuth() {
  const secApp = initializeApp(firebaseConfig, "secondary" + Date.now());
  const secAuth = getAuth(secApp);
  return { secApp, secAuth };
}

// ========== API PÚBLICA (window.Auth) ==========
window.Auth = {
  auth,
  db,

  /** Login normal */
  async login(email, password, remember = false) {
    try {
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

  /** Registrar usuario (admin no pierde sesión) */
  async registerUser(email, nombre, rango, agrupacion) {
    const { secApp, secAuth } = getSecondaryAuth();
    try {
      const clave = generarClave();
      const userCred = await createUserWithEmailAndPassword(secAuth, email, clave);
      const uid = userCred.user.uid;

      await setDoc(doc(db, "usuarios", uid), {
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

  /** Cambiar contraseña (primer login) */
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

  /** Monitor de doble sesión */
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

  /** Cerrar sesión */
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
    if (window._sessionUnsub) { window._sessionUnsub(); window._sessionUnsub = null; }
    localStorage.removeItem("sistemaOrquestas_session");
    sessionStorage.removeItem("sistemaOrquestas_session");
    localStorage.removeItem("currentSessionId");
    sessionStorage.removeItem("currentSessionId");
    window.location.href = "index.html";
  },

  getSession() {
    const raw = sessionStorage.getItem("sistemaOrquestas_session") ||
                localStorage.getItem("sistemaOrquestas_session");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },

  hasPermission(perm) {
    const s = this.getSession();
    return s ? s.permissions.includes(perm) : false;
  },

  getRole() {
    const s = this.getSession();
    return s ? s.role : null;
  },

  onAuthChange(cb) {
    return onAuthStateChanged(auth, cb);
  }
};
