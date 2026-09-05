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

  // Mapa de categoría de error → explicación en criollo + qué revisar.
  // Esto es lo que arma el "plan para cada error" que se muestra en el chat
  // — SOLO para roles con manage_users (ver más abajo). Para todos los
  // demás, hay un mensaje corto y humano en vez de esto.
  const EXPLICACION_POR_CATEGORIA = {
    sin_conexion_al_backend: {
      titulo: "El navegador no pudo ni conectarse al servidor",
      quehacer: "Puede ser: (1) no hay internet ahora mismo, (2) el proyecto de Vercel no está desplegado en esa URL, o (3) CORS está bloqueando el pedido. Revisá en Vercel → tu proyecto → Deployments, que haya un despliegue activo, y que la URL en backend-api.js (API_BASE_URL) sea exactamente esa.",
    },
    respuesta_no_json_502: {
      titulo: "Vercel cortó la función a mitad de camino (502)",
      quehacer: "Esto NO es un error controlado por el código — significa que la función se cayó antes de terminar (ej. crasheó, o Vercel no pudo levantarla). Andá a Vercel → tu proyecto → Deployments → el último → \"Functions\" → \"api/chat\" y mirá los logs ahí: el error real y su stack trace están ahí, no acá.",
    },
    respuesta_no_json_504: {
      titulo: "La función tardó demasiado y Vercel la cortó (504, tiempo agotado)",
      quehacer: "El código ya tiene timeouts internos de 4s por proveedor de IA para evitar esto — si igual pasa, puede ser que Firestore esté respondiendo muy lento. Mirá los logs de la función en Vercel para confirmar en qué paso se colgó.",
    },
    ambos_proveedores_fallaron: {
      titulo: "El servidor respondió, pero ni Groq ni Gemini pudieron generar una respuesta",
      quehacer: "Mirá el detalle de cada proveedor abajo — cada uno dice exactamente por qué falló (clave inválida, modelo no encontrado, límite de uso, etc.).",
    },
    error_interno_servidor: {
      titulo: "Hubo un error inesperado dentro del código del servidor",
      quehacer: "Esto es un bug real de código (no de configuración) — el detalle técnico de abajo tiene el mensaje exacto de JavaScript que lo causó.",
    },
    pedido_invalido: {
      titulo: "El servidor rechazó el pedido por su formato",
      quehacer: "Esto normalmente no debería pasar desde la interfaz del chat — si lo ves, avisale a un administrador.",
    },
    // AGREGADAS 2026-09-01, junto con el resto del arreglo de seguridad del
    // chat: ahora /api/chat exige sesión y tiene límite de uso, así que
    // pueden aparecer estas dos categorías nuevas que antes no existían.
    no_autenticado: {
      titulo: "El servidor rechazó el pedido por no traer sesión válida",
      quehacer: "El token de Firebase no llegó o venció. Normalmente se arregla solo recargando la página (Ctrl+Shift+R) para renovar la sesión; si persiste, la persona debe cerrar sesión y volver a entrar.",
    },
    limite_de_uso_excedido: {
      titulo: "Se llegó al límite de mensajes seguidos para esta cuenta",
      quehacer: "Es una protección a propósito (evita que una cuenta agote la cuota paga de Groq/Gemini). Se libera solo pasados unos minutos — no hace falta tocar nada en Vercel.",
    },
  };

  function explicarPorStatus(status) {
    if (status === 404) return { titulo: "La URL del servidor no existe (404)", quehacer: "El proyecto de Vercel no tiene ninguna función en esa ruta. Revisá que API_BASE_URL en backend-api.js sea EXACTAMENTE la URL que Vercel te dio (Vercel → tu proyecto → Domains), y que el archivo api/chat.js esté commiteado y desplegado." };
    if (status === 401 || status === 403) return { titulo: `El servidor rechazó el pedido (código ${status})`, quehacer: "Puede ser un problema de permisos o de configuración del backend." };
    if (status === 429) return { titulo: "Demasiados pedidos seguidos (429)", quehacer: "Puede ser el límite propio del chat, o un límite de uso de Groq/Gemini. Mirá el mensaje exacto de abajo." };
    if (status >= 500) return { titulo: `El servidor tuvo un problema interno (código ${status})`, quehacer: "Mirá los logs de la función en Vercel para el detalle exacto." };
    return { titulo: `El servidor respondió con un error (código ${status})`, quehacer: "Revisá el detalle técnico de abajo." };
  }

  function armarReporteDeError(err) {
    const lineas = ["⚠️ No pude responder. Reporte completo:", ""];
    lineas.push(`· Versión del código que respondió: ${err.version || "(no vino ninguna — es una señal fuerte de que el backend en Vercel todavía tiene código VIEJO, de antes de este arreglo)"}`);
    lineas.push(`· Mensaje: ${err.message}`);
    if (err.status) lineas.push(`· Código HTTP: ${err.status}`);
    if (typeof err.tiempoMs === "number") lineas.push(`· Tiempo hasta la falla: ${err.tiempoMs} ms`);
    if (err.urlIntentada) lineas.push(`· URL a la que se intentó conectar: ${err.urlIntentada}`);

    const info = EXPLICACION_POR_CATEGORIA[err.categoria] || (err.status ? explicarPorStatus(err.status) : null);
    if (info) {
      lineas.push("", `🔎 ${info.titulo}`, `👉 ${info.quehacer}`);
    }

    if (err.detalle_groq || err.detalle_gemini) {
      lineas.push("", "Motivo exacto por proveedor:");
      if (err.detalle_groq) lineas.push(`· Groq: ${err.detalle_groq}`);
      if (err.detalle_gemini) lineas.push(`· Gemini: ${err.detalle_gemini}`);
    }
    if (err.detalleTecnico) {
      lineas.push("", `Detalle técnico crudo: ${String(err.detalleTecnico).slice(0, 400)}`);
    }
    return lineas.join("\n");
  }

  // AGREGADO 2026-09-01: throttle simple para no disparar el diagnóstico
  // (2 llamadas reales a Groq/Gemini) más de una vez cada 20s desde ESTA
  // pestaña, aunque la persona reintente varias veces seguidas.
  let ultimoDiagnosticoTs = 0;
  // AGREGADO 2026-09-01: antes no había ninguna protección contra mandar
  // varios mensajes mientras el anterior seguía "Pensando…" — un click
  // rápido (fácil que pase con dedos en un teléfono) disparaba pedidos
  // superpuestos, con el riesgo de que las respuestas volvieran en un
  // orden distinto al que se preguntaron. Ahora el input y el botón se
  // desactivan mientras hay un pedido en curso.
  let enviando = false;
  const btnEnviar = contenedorEl.querySelector("#chat-ia-enviar");

  async function enviar() {
    if (enviando) return;
    const texto = input.value.trim();
    if (!texto) return;
    enviando = true;
    input.disabled = true;
    btnEnviar.disabled = true;
    input.value = "";
    agregarMensaje(texto, false);
    // Mandamos el historial ANTES de agregar el mensaje actual — el backend
    // ya lo agrega aparte, así que si lo empujamos acá antes, se mandaría
    // duplicado (una vez dentro del historial, otra vez como "mensaje").
    const historialAEnviar = historial.slice(-10);
    historial.push({ rol: "usuario", texto });

    const cargando = document.createElement("div");
    cargando.className = "chat-ia-msg chat-ia-msg-bot chat-ia-cargando";
    cargando.textContent = "Pensando…";
    mensajes.appendChild(cargando);
    mensajes.scrollTop = mensajes.scrollHeight;

    try {
      const res = await backendAPI.chat(texto, historialAEnviar);
      cargando.remove();
      agregarMensaje(res.respuesta, true);
      historial.push({ rol: "ia", texto: res.respuesta });
    } catch (err) {
      cargando.remove();

      // CORREGIDO 2026-09-01: esta ventana de chat la usan sobre todo
      // estudiantes (a veces niños) — antes, CUALQUIER falla le mostraba a
      // cualquiera un reporte técnico crudo ("Revisá Vercel → Deployments
      // → Functions...", nombres de variables de entorno, etc.), que no
      // sirve para nadie que no pueda entrar al panel de Vercel, y encima
      // expone detalles internos del servidor a cualquier visitante.
      // Ahora: solo quien tiene manage_users (admin/director) ve el reporte
      // técnico completo — el resto ve un mensaje corto y tranquilizador.
      const esResponsableTecnico = window.Auth?.checkPermission?.("manage_users");

      if (!esResponsableTecnico) {
        agregarMensaje("😔 El Tutor Musical no está disponible en este momento. Probá recargar la página; si sigue sin responder en unos minutos, avisale a un director o administrador.", true);
        return;
      }

      agregarMensaje(armarReporteDeError(err), true);

      // CORREGIDO 2026-09-01: antes esto se disparaba SIEMPRE, para
      // CUALQUIER usuario, en cada mensaje fallido — cada llamada acá hace
      // 2 pedidos reales y pagos más (Groq + Gemini) del lado del backend.
      // Con muchos estudiantes usando el chat a la vez durante una clase,
      // un problema pasajero de límite de uso se retroalimentaba solo: más
      // fallas → más diagnósticos automáticos → más pedidos reales → el
      // límite se agota más rápido todavía. Ahora: (1) solo se ejecuta para
      // quien puede realmente actuar sobre el resultado (manage_users), y
      // (2) como mucho una vez cada 20s por pestaña, aunque la persona
      // reintente varias veces seguidas.
      const ahora = Date.now();
      if (ahora - ultimoDiagnosticoTs < 20000) {
        agregarMensaje("🔎 (Diagnóstico automático omitido — ya se corrió hace menos de 20s. Mirá el resultado del mensaje anterior, o esperá un momento antes de reintentar.)", true);
        return;
      }
      ultimoDiagnosticoTs = ahora;

      // Además del error puntual de este mensaje, corremos el diagnóstico
      // completo — sirve para distinguir "esto falló una vez" de "esto está
      // roto en general" (variables de entorno faltantes, etc.)
      const diag = await backendAPI.diagnostico();

      // Veredicto directo: ¿el código que respondió es el mismo que ve el
      // diagnóstico ahora mismo? Si no coinciden (o si el error no trae
      // versión), es matemáticamente imposible que sea un problema de
      // Groq/Gemini — el código que está corriendo no es el actualizado.
      if (diag.version && err.version && diag.version !== err.version) {
        agregarMensaje(`🔎 VEREDICTO: el chat respondió con la versión "${err.version}" pero el diagnóstico (recién) ve la versión "${diag.version}". Son distintas — hay MÁS DE UN deploy sirviendo tráfico a la vez, o el navegador tiene una respuesta vieja en caché. Probá recargar con Ctrl+Shift+R.`, true);
      } else if (!err.version && diag.version) {
        agregarMensaje(`🔎 VEREDICTO: el chat respondió SIN campo de versión, pero el diagnóstico sí tiene una ("${diag.version}"). Esto confirma que el código que respondió tu mensaje es una versión VIEJA — el archivo _lib/proveedoresIA.js en producción no tiene los últimos cambios. No es un problema de Groq/Gemini ni de tus claves: es que el deploy no se aplicó todavía.`, true);
      }

      if (diag.variables_de_entorno) {
        const fallas = Object.entries(diag.variables_de_entorno)
          .filter(([, v]) => String(v).includes("FALTA"))
          .map(([k]) => k);
        const piezas = [
          diag.firebase_admin?.includes("❌") ? "Firebase: " + diag.firebase_admin : null,
          diag.groq?.includes("❌") ? "Groq: " + diag.groq : null,
          diag.gemini?.includes("❌") ? "Gemini: " + diag.gemini : null,
        ].filter(Boolean);
        let msg = `🔎 Diagnóstico automático del servidor (versión: ${diag.version || "desconocida"}):`;
        if (fallas.length) msg += "\n· Faltan variables de entorno en Vercel: " + fallas.join(", ");
        if (piezas.length) msg += "\n· " + piezas.join("\n· ");
        if (!fallas.length && !piezas.length) {
          msg += "\nProbó Groq y Gemini con una llamada real ahora mismo y los dos respondieron bien. Si tu mensaje falló pero esto dice que está todo bien, mirá el VEREDICTO de arriba — casi seguro es un problema de versión desplegada, no de las IA en sí.";
        }
        agregarMensaje(msg, true);
      } else if (diag.error) {
        agregarMensaje("🔎 Ni el diagnóstico respondió: " + diag.error, true);
      }
    } finally {
      enviando = false;
      input.disabled = false;
      btnEnviar.disabled = false;
      input.focus();
    }
  }

  contenedorEl.querySelector("#chat-ia-enviar").addEventListener("click", enviar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
}
