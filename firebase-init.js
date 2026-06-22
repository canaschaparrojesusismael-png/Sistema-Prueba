/**
 * firebase-init.js – Configuración centralizada de Firebase
 * =====================================================================
 * ¡IMPORTANTE! Estas son las credenciales reales del proyecto.
 * =====================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBHHCJM6JFb6IkaT-MgazyTGgOKJdjcKvo",
  authDomain: "sistema-cma.firebaseapp.com",
  projectId: "sistema-cma",
  storageBucket: "sistema-cma.firebasestorage.app",
  messagingSenderId: "356833587736",
  appId: "1:356833587736:web:b44458eebc115eb98d096d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { firebaseConfig };
