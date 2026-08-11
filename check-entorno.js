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
