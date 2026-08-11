import { auth } from "./firebase-init.js";

// 👉 Cambiá esto por la URL real que te da Vercel al desplegar sistema-cma-api
// (ver README.md de esa carpeta). Ejemplo: "https://sistema-cma-api.vercel.app"
export const API_BASE_URL = "https://sistema-cma-api.vercel.app";

async function llamarAPI(endpoint, body, { anonimo = false } = {}) {
  let headers = { "Content-Type": "application/json" };

  if (!anonimo) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debes iniciar sesión.");
    const idToken = await user.getIdToken();
    headers.Authorization = `Bearer ${idToken}`;
  }

  let resp;
  try {
    resp = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch (err) {
    throw new Error(
      "No se pudo contactar al servidor (¿configuraste API_BASE_URL en backend-api.js?): " + err.message
    );
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Error del servidor (${resp.status})`);
  return data;
}

// Firma equivalente a la de las Cloud Functions: se llama igual,
// solo que ahora pega contra Vercel en vez de Firebase.
export const backendAPI = {
  crearUsuario: (datos) => llamarAPI("crear-usuario", datos),
  resetPassword: (targetUid, newPassword) => llamarAPI("reset-password", { targetUid, newPassword }),
  eliminarUsuario: (targetUid) => llamarAPI("eliminar-usuario", { targetUid }),
  sincronizarRango: (targetUid) => llamarAPI("sincronizar-rango", { targetUid }),
  // El chat no requiere sesión: cualquier visitante del sitio público puede usarlo.
  chat: (mensaje, historial) => llamarAPI("chat", { mensaje, historial }, { anonimo: true }),
};
