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
  const inicio = Date.now();
  try {
    resp = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch (errRed) {
    // Esto NUNCA llegó a Vercel — es un fallo de red del lado del navegador:
    // sin internet, CORS bloqueado, DNS que no resuelve, o la URL de
    // API_BASE_URL (arriba en este archivo) apunta a un proyecto que no
    // existe o no está desplegado.
    const err = new Error("No se pudo contactar al servidor.");
    err.categoria = "sin_conexion_al_backend";
    err.detalleTecnico = errRed.message;
    err.urlIntentada = `${API_BASE_URL}/api/${endpoint}`;
    throw err;
  }

  const tiempoMs = Date.now() - inicio;
  const textoCrudo = await resp.text();
  let data = {};
  let esJsonValido = true;
  try {
    data = textoCrudo ? JSON.parse(textoCrudo) : {};
  } catch {
    esJsonValido = false;
  }

  if (!resp.ok) {
    const err = new Error(data.error || `Error del servidor (${resp.status})`);
    err.status = resp.status;
    err.tiempoMs = tiempoMs;
    err.categoria = data.categoria || null;
    err.detalle_groq = data.detalle_groq;
    err.detalle_gemini = data.detalle_gemini;
    err.detalleTecnico = data.detalle;
    err.version = data.version || null;
    if (!esJsonValido) {
      // La respuesta NO es JSON — esto significa que mi código de
      // api/chat.js nunca llegó a ejecutarse del todo: Vercel (o algo antes
      // de Vercel, como un proxy) cortó la función y devolvió su propia
      // página/mensaje de error genérico. Es la diferencia entre "mi app
      // dijo que falló" (bug de código, con motivo exacto) y "la plataforma
      // cortó la función" (timeout, crash, límite de plan, etc.)
      err.categoria = "respuesta_no_json_" + resp.status;
      err.detalleTecnico = textoCrudo.slice(0, 500);
    }
    throw err;
  }
  return data;
}

// Firma equivalente a la de las Cloud Functions: se llama igual,
// solo que ahora pega contra Vercel en vez de Firebase.
export const backendAPI = {
  crearUsuario: (datos) => llamarAPI("crear-usuario", datos),
  resetPassword: (targetUid, newPassword) => llamarAPI("reset-password", { targetUid, newPassword }),
  eliminarUsuario: (targetUid) => llamarAPI("eliminar-usuario", { targetUid }),
  sincronizarRango: (targetUid) => llamarAPI("sincronizar-rango", { targetUid }),
  // El chat SÍ requiere sesión (ver por qué en el comentario de
  // api/chat.js): manda el token igual que el resto de los endpoints.
  chat: (mensaje, historial) => llamarAPI("chat", { mensaje, historial }),
  // Diagnóstico: dice exactamente qué pieza del backend está fallando
  // (Firebase / Groq / Gemini / variables de entorno), sin exponer claves.
  async diagnostico() {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/diagnostico`);
      const texto = await resp.text();
      try {
        return JSON.parse(texto);
      } catch {
        return { ok: false, error: `El diagnóstico respondió algo que no es JSON (código ${resp.status}). Es señal de que el proyecto de Vercel no está desplegado en esa URL, o Deployment Protection está bloqueando el acceso.`, respuestaCruda: texto.slice(0, 300) };
      }
    } catch (err) {
      return { ok: false, error: "No se pudo contactar ni siquiera al diagnóstico: " + err.message };
    }
  },
};
