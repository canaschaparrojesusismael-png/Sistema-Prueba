import { backendAPI } from "./backend-api.js";

// Historial en memoria (se pierde al recargar, a propósito: no guardamos
// conversaciones de estudiantes en ningún lado sin su conocimiento).
let historial = [];

/**
 * Monta el chat DENTRO del contenedor que le pases (no flota, no aparece
 * solo en cualquier página). Pensado para usarse una sola vez, en
 * formacion.html, dentro de una caja de tamaño ya definido por el CSS
 * del sitio (.chat-ia-embebido).
 */
export function montarChatEmbebido(contenedorEl) {
  if (!contenedorEl || contenedorEl.dataset.chatMontado) return;
  contenedorEl.dataset.chatMontado = "1";

  contenedorEl.innerHTML = `
    <div class="chat-ia-header">
      <span><i class="fa-solid fa-music"></i> Tutor Musical IA</span>
    </div>
    <div class="chat-ia-mensajes" id="chat-ia-mensajes">
      <div class="chat-ia-msg chat-ia-msg-bot">
        ¡Hola! Preguntame sobre teoría, instrumentos, historia de El Sistema, o dónde
        encontrar un tema acá en Formación 🎵
      </div>
    </div>
    <div class="chat-ia-input-row">
      <input type="text" id="chat-ia-input" placeholder="Preguntá algo de música…" />
      <button type="button" id="chat-ia-enviar"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;

  const input = contenedorEl.querySelector("#chat-ia-input");
  const mensajes = contenedorEl.querySelector("#chat-ia-mensajes");

  function agregarMensaje(texto, esBot) {
    const div = document.createElement("div");
    div.className = "chat-ia-msg " + (esBot ? "chat-ia-msg-bot" : "chat-ia-msg-user");
    div.textContent = texto;
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  async function enviar() {
    const texto = input.value.trim();
    if (!texto) return;
    input.value = "";
    agregarMensaje(texto, false);
    historial.push({ rol: "usuario", texto });

    const cargando = document.createElement("div");
    cargando.className = "chat-ia-msg chat-ia-msg-bot chat-ia-cargando";
    cargando.textContent = "Pensando…";
    mensajes.appendChild(cargando);
    mensajes.scrollTop = mensajes.scrollHeight;

    try {
      const res = await backendAPI.chat(texto, historial.slice(-10));
      cargando.remove();
      agregarMensaje(res.respuesta, true);
      historial.push({ rol: "ia", texto: res.respuesta });
    } catch (err) {
      cargando.remove();
      agregarMensaje("No pude responder ahora mismo. Detalle: " + err.message, true);
      // Corremos el diagnóstico automáticamente para decir la causa real
      // (Firebase / Groq / Gemini / CORS) en vez de dejarte adivinando.
      const diag = await backendAPI.diagnostico();
      if (diag.variables_de_entorno) {
        const fallas = Object.entries(diag.variables_de_entorno)
          .filter(([, v]) => String(v).includes("FALTA"))
          .map(([k]) => k);
        const piezas = [
          diag.firebase_admin?.includes("❌") ? "Firebase: " + diag.firebase_admin : null,
          diag.groq?.includes("❌") ? "Groq: " + diag.groq : null,
          diag.gemini?.includes("❌") ? "Gemini: " + diag.gemini : null,
        ].filter(Boolean);
        let msg = "🔎 Diagnóstico automático:";
        if (fallas.length) msg += "\n· Faltan variables de entorno en Vercel: " + fallas.join(", ");
        if (piezas.length) msg += "\n· " + piezas.join("\n· ");
        if (!fallas.length && !piezas.length) msg += "\nTodo lo configurado se ve bien — puede ser un problema puntual, probá de nuevo en un momento.";
        agregarMensaje(msg, true);
      } else if (diag.error) {
        agregarMensaje("🔎 Ni el diagnóstico respondió: " + diag.error + " — revisá que el proyecto esté desplegado en Vercel y que Deployment Protection esté desactivado.", true);
      }
    }
  }

  contenedorEl.querySelector("#chat-ia-enviar").addEventListener("click", enviar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
}
