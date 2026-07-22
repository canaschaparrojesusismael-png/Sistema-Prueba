import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

window.UI = {
  _configUnsub: null,
  _livePanelUnsub: null,

  render() {
    const loginArea = document.getElementById("login-area");
    const userNav = document.getElementById("user-nav");
    const target = loginArea || userNav;
    const carrusel = document.getElementById("carousel-container");

    if (target) target.innerHTML = "";
    if (carrusel) { const old = carrusel.querySelector(".carousel-edit-btn"); if (old) old.remove(); }

    const session = window.Auth?.getSession();

    if (!session) {
      if (target) target.innerHTML = `<a href="login.html" class="btn btn-login">Iniciar Sesión</a>`;
      this._removeStatusBar();
    } else {
      this._renderAutenticado(session, target);
      if (window.Auth?.checkPermission && window.Auth.checkPermission("edit_carousel")) this._renderBotonEngrane(carrusel);
      this._renderConfigGear(target);
      this._renderStatusBar(session);
      if (window.Auth?.checkPermission && window.Auth.checkPermission("manage_users")) this._initLivePanel();
    }
  },

  _renderAutenticado(session, container) { /* igual que antes, pero usando window.Auth */ },
  _renderBotonEngrane(carrusel) { /* igual */ },
  _renderStatusBar(session) { /* igual */ },
  _removeStatusBar() { /* igual */ },
  _renderConfigGear(container) { /* igual, usando window.Auth */ },
  _loadConfigStats() { /* igual */ },
  _initLivePanel() { /* igual */ }
};

// Inicialización directa (sin DOMContentLoaded)
window.UI.render();
