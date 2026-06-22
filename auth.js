/**
 * ===========================================================================
 * auth.js – Autenticación con Firebase (Firebase Auth + Firestore)
 * Sistema Nacional de Orquestas – Premium UI
 * ===========================================================================
 * Incluye:
 *  - Firebase App primaria (auth principal)
 *  - Instancia secundaria para registro de usuarios sin cerrar sesión
 *  - Roles: owner, admin, profesor, estudiante
 *  - Bloqueo de doble sesión (currentSessionId)
 *  - Redirección por cambio de clave obligatorio
 */

// ===================== CONFIGURACIÓN DE FIREBASE =====================
// Reemplaza estos valores con los de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "sistema-orquestas.firebaseapp.com",
  projectId: "sistema-orquestas",
  storageBucket: "sistema-orquestas.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxx"
};

// ===================== INICIALIZACIÓN =====================
// Importaciones desde CDN (ya disponibles globalmente como firebase.*)
const { initializeApp, getApp, getApps, deleteApp } = firebase;
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } = firebase.auth;
const { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs } = firebase.firestore;

// --- App Primaria ---
const app = initializeApp(firebaseConfig, "primary");
const auth = getAuth(app);
const db = getFirestore(app);

// --- Instancia Secundaria (para registrar usuarios sin cerrar sesión) ---
function getSecondaryAuth() {
  const secondaryApp = initializeApp(firebaseConfig, "secondary" + Date.now());
  const secAuth = getAuth(secondaryApp);
  return { secondaryApp, secAuth };
}

// ===================== UTILIDADES =====================

/** Genera una contraseña aleatoria de 8 caracteres */
function generarClave() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let clave = "";
  for (let i = 0; i < 8; i++) clave += chars.charAt(Math.floor(Math.random() * chars.length));
  return clave;
}

/** Genera un UUID v4 simple */
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ===================== API PÚBLICA =====================

window.Auth = {
  auth,
  db,

  /**
   * Inicia sesión con email/contraseña.
   * Verifica roles, bloqueo de doble sesión y redirección por cambio de clave.
   */
  async login(email, password, remember = false) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Obtener datos del usuario desde Firestore
      const userDoc = await getDoc(doc(db, "usuarios", user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        return { success: false, error: "Usuario no registrado en el sistema." };
      }

      const userData = userDoc.data();

      // Verificar si requiere cambio de clave
      if (userData.requiresPasswordChange) {
        sessionStorage.setItem("pendingPasswordChange", user.uid);
        return { success: true, requiresPasswordChange: true, uid: user.uid };
      }

      // Generar ID de sesión único
      const sessionId = generarUUID();
      sessionStorage.setItem("currentSessionId", sessionId);
      if (remember) localStorage.setItem("currentSessionId", sessionId);

      // Actualizar Firestore: online + sessionId
      await updateDoc(doc(db, "usuarios", user.uid), {
        isOnline: true,
        currentSessionId: sessionId,
        lastLogin: new Date().toISOString()
      });

      // Listener de doble sesión
      Auth.monitorSession(user.uid, sessionId);

      // Guardar datos de sesión en sessionStorage para UI rápida
      const sessionData = {
        id: user.uid,
        uid: user.uid,
        email: user.email,
        nombre: userData.nombre,
        role: userData.rango, // "owner" | "admin" | "profesor" | "estudiante"
        firstName: userData.nombre?.split(" ")[0] || "",
        lastName: userData.nombre?.split(" ").slice(1).join(" ") || "",
        age: userData.edad || 0,
        group: userData.agrupacion || "",
        state: userData.estado || "",
        nucleus: userData.nucleo || "",
        permissions: userData.rango === "owner" || userData.rango === "admin"
          ? ["view_profile", "access_panel", "edit_carousel", "manage_users"]
          : userData.rango === "profesor"
            ? ["view_profile", "access_panel"]
            : ["view_profile"],
        loginTime: Date.now()
      };
      sessionStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));
      if (remember) localStorage.setItem("sistemaOrquestas_session", JSON.stringify(sessionData));

      return { success: true, user: sessionData };
    } catch (error) {
      console.error("Error de login:", error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Registra un nuevo usuario usando la instancia secundaria de Firebase.
   * No cierra la sesión del admin actual.
   * @param {string} email
   * @param {string} nombre
   * @param {string} rango - "profesor" | "estudiante"
   * @param {string} agrupacion
   * @returns {object} { success, clave, error }
   */
  async registerUser(email, nombre, rango, agrupacion) {
    const { secondaryApp, secAuth } = getSecondaryAuth();
    try {
      const clave = generarClave();
      // Crear usuario en Auth secundario
      const userCredential = await createUserWithEmailAndPassword(secAuth, email, clave);
      const uid = userCredential.user.uid;

      // Guardar datos en Firestore
      await setDoc(doc(db, "usuarios", uid), {
        nombre,
        rango,
        agrupacion,
        email,
        isOnline: false,
        currentSessionId: "",
        requiresPasswordChange: true, // Debe cambiar clave en primer login
        estado: "",
        nucleo: "",
        edad: 0,
        fechaCreacion: new Date().toISOString()
      });

      // Cerrar sesión de la instancia secundaria
      await signOut(secAuth);
      await deleteApp(secondaryApp);

      return { success: true, clave, uid };
    } catch (error) {
      console.error("Error al registrar usuario:", error);
      try { await deleteApp(secondaryApp); } catch (e) { /* ignorar */ }
      return { success: false, error: error.message };
    }
  },

  /** Cambia la contraseña del usuario actual (flujo de primer login) */
  async changePassword(newPassword) {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "No hay sesión activa." };
    try {
      await updatePassword(user, newPassword);
      // Actualizar Firestore: quitar flag
      await updateDoc(doc(db, "usuarios", user.uid), {
        requiresPasswordChange: false
      });
      sessionStorage.removeItem("pendingPasswordChange");
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Monitor de doble sesión */
  monitorSession(uid, currentSessionId) {
    const unsub = onSnapshot(doc(db, "usuarios", uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (data.currentSessionId && data.currentSessionId !== currentSessionId) {
        // Otra sesión iniciada: forzar logout
        alert("Se ha iniciado sesión en otro dispositivo. Esta sesión se cerrará.");
        Auth.logout();
      }
    });
    // Guardar referencia para cancelar al cerrar sesión
    window._sessionUnsub = unsub;
  },

  /** Cierra sesión y limpia estado */
  async logout() {
    try {
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, "usuarios", user.uid), {
          isOnline: false,
          currentSessionId: ""
        });
        await signOut(auth);
      }
    } catch (e) { /* ignorar */ }
    // Cancelar listener
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

  /** Obtener sesión actual */
  getSession() {
    const data = sessionStorage.getItem("sistemaOrquestas_session") ||
                 localStorage.getItem("sistemaOrquestas_session");
    if (!data) return null;
    try { return JSON.parse(data); } catch (e) { return null; }
  },

  hasPermission(perm) {
    const s = this.getSession();
    return s ? s.permissions.includes(perm) : false;
  },

  getRole() {
    const s = this.getSession();
    return s ? s.role : null;
  },

  /** Escucha cambios de autenticación (para restauración de sesión) */
  onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
  }
};
