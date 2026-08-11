import { backendAPI } from "./backend-api.js";

// Historial en memoria (se pierde al recargar, a propósito: no guardamos
// conversaciones de estudiantes en ningún lado sin su conocimiento).
let historial = [];

function montarWidget() {
  if (document.getElementById("chat-ia-widget")) return;

  const raiz = document.createElement("div");
  raiz.id = "chat-ia-widget";
  raiz.innerHTML = `
    <button type="button" id="chat-ia-toggle" title="Tutor musical IA">
      <i class="fa-solid fa-comments"></i>
    </button>
    <div id="chat-ia-panel" class="chat-ia-panel">
      <div class="chat-ia-header">
        <span><i class="fa-solid fa-music"></i> Tutor Musical</span>
        <button type="button" id="chat-ia-cerrar">&times;</button>
      </div>
      <div class="chat-ia-mensajes" id="chat-ia-mensajes">
        <div class="chat-ia-msg chat-ia-msg-bot">
          ¡Hola! Soy el tutor musical del Sistema. Preguntame sobre teoría, instrumentos,
          historia de El Sistema, o dónde encontrar un tema en Formación 🎵
        </div>
      </div>
      <div class="chat-ia-input-row">
        <input type="text" id="chat-ia-input" placeholder="Preguntá algo de música…" />
        <button type="button" id="chat-ia-enviar"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  `;
  document.body.appendChild(raiz);

  const panel = document.getElementById("chat-ia-panel");
  const toggle = document.getElementById("chat-ia-toggle");
  const input = document.getElementById("chat-ia-input");
  const mensajes = document.getElementById("chat-ia-mensajes");

  toggle.addEventListener("click", () => panel.classList.toggle("abierto"));
  document.getElementById("chat-ia-cerrar").addEventListener("click", () => panel.classList.remove("abierto"));

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
      agregarMensaje(
        "No pude responder ahora mismo (¿ya conectaron el backend en Vercel?). Detalle: " + err.message,
        true
      );
    }
  }

  document.getElementById("chat-ia-enviar").addEventListener("click", enviar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", montarWidget);
} else {
  montarWidget();
}
