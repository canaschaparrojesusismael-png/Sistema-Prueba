/**
 * firebase-init.js – Configuración centralizada de Firebase
 * =====================================================================
 * ¡IMPORTANTE! Reemplaza las credenciales con las de tu proyecto real.
 * =====================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXX",        // <-- TU API KEY
  authDomain: "sistema-orquestas.firebaseapp.com",       // <-- TU AUTH DOMAIN
  projectId: "sistema-orquestas",                        // <-- TU PROJECT ID
  storageBucket: "sistema-orquestas.appspot.com",        // <-- TU STORAGE BUCKET
  messagingSenderId: "000000000000",                     // <-- TU SENDER ID
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxx"       // <-- TU APP ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { firebaseConfig };