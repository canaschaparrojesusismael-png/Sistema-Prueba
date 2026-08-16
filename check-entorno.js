// Este script NO es un módulo (a propósito), así que se ejecuta incluso
// cuando el navegador bloquea los <script type="module"> por abrir el
// archivo directamente desde el disco (protocolo file://).
// Si detecta esa situación, avisa en pantalla para que no parezca "no funciona nada"
// sin explicación.
(function () {
  if (location.protocol !== "file:") return;
  document.addEventListener("DOMContentLoaded", function () {
    var aviso = document.createElement("div");
    aviso.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:99999;background:#c1121f;" +
      "color:#fff;padding:10px 16px;font-family:sans-serif;font-size:13px;" +
      "text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
    aviso.innerHTML =
      "⚠️ Abriste este archivo directamente (file://). Los inicios de sesión y menús " +
      "NO funcionan así por seguridad del navegador. Usá la extensión <b>Live Server</b> " +
      "de VS Code (clic derecho → \"Open with Live Server\") o corré " +
      "<code>python3 -m http.server</code> y entrá por http://localhost.";
    document.body.prepend(aviso);
  });
})();

// ==========================================================
// VIGÍA GLOBAL: si CUALQUIER script de la página tira un error
// no capturado (incluyendo SyntaxError en OTRO archivo — este
// script vive aparte, así que sigue funcionando igual), lo
// mostramos bien visible y garantizamos que siempre haya una
// forma de llegar a login.html.
// ==========================================================
(function () {
  var yaAvisado = false;

  function mostrarError(mensaje) {
    if (yaAvisado) return; // no llenar la pantalla de carteles repetidos
    yaAvisado = true;
    var aviso = document.createElement("div");
    aviso.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1a1a1a;" +
      "color:#fff;padding:10px 16px;font-family:monospace;font-size:12px;" +
      "text-align:left;box-shadow:0 -2px 8px rgba(0,0,0,0.4);max-height:120px;overflow:auto;";
    aviso.innerHTML =
      "⚠️ Error de JavaScript detectado (mandale esto exacto a soporte): <br><code>" +
      String(mensaje).replace(/</g, "&lt;") + "</code>";
    document.body?.appendChild(aviso);
  }

  window.addEventListener("error", function (e) {
    mostrarError(e.message + " (" + e.filename + ":" + e.lineno + ")");
  });
  window.addEventListener("unhandledrejection", function (e) {
    mostrarError("Promesa rechazada sin capturar: " + (e.reason?.message || e.reason));
  });

  // Red de seguridad: si en 2.5s el botón de "Iniciar Sesión"/menú de usuario
  // sigue sin aparecer (sea cual sea la razón — incluido un SyntaxError en
  // ui-manager.js), lo forzamos a mano. El login NUNCA debe depender 100% de
  // que ningún otro script haya salido bien.
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      var nav = document.getElementById("user-nav") || document.getElementById("login-area");
      if (nav && !nav.innerHTML.trim()) {
        nav.innerHTML = '<a href="login.html" class="btn btn-nav btn-login">Iniciar Sesión</a>';
        console.warn("⚠️ Se activó el botón de login de emergencia (check-entorno.js). Esto significa que ui-manager.js no llegó a ejecutarse — revisá el cartel de error de arriba.");
      }
    }, 2500);
  });
})();
