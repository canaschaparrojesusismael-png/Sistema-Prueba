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
      if (window.Auth.checkPermission("edit_carousel")) this._renderBotonEngrane(carrusel);
      this._renderConfigGear(target);
      this._renderStatusBar(session);
      if (window.Auth.checkPermission("manage_users")) this._initLivePanel();
    }
  },

  _renderAutenticado(session, container) {
    if (!container) return;
    const btnLogout = document.createElement("button"); btnLogout.className = "btn btn-nav btn-cerrar"; btnLogout.textContent = "Cerrar Sesión"; btnLogout.addEventListener("click", () => window.Auth.logout());
    const rutasProtegidas = ["panel.html","piezas.html","formacion.html","miembros.html"];
    const enPanel = rutasProtegidas.some(r => location.pathname.includes(r));
    const btnPanel = document.createElement("a"); btnPanel.href = enPanel ? "index.html" : "panel.html"; btnPanel.className = "btn btn-nav btn-panel"; btnPanel.textContent = enPanel ? "Volver al inicio" : "Acceder a la página";
    const initial = (session.firstName?.charAt(0) || "?").toUpperCase();
    const btnUser = document.createElement("button"); btnUser.className = "btn btn-nav btn-user"; btnUser.textContent = initial; btnUser.type = "button";
    const submenu = document.createElement("div"); submenu.className = "user-submenu";
    submenu.innerHTML = `<p><strong>${session.nombre || session.firstName + " " + (session.lastName || "")}</strong></p><p>Rol: ${session.role}</p><p>Agrupación: ${session.group || "—"}</p><p>Conectado</p>`; submenu.style.display = "none"; btnUser.appendChild(submenu);
    btnUser.addEventListener("mouseenter", () => submenu.style.display = "block");
    btnUser.addEventListener("mouseleave", () => submenu.style.display = "none");
    submenu.addEventListener("mouseenter", () => submenu.style.display = "block");
    submenu.addEventListener("mouseleave", () => submenu.style.display = "none");
    container.appendChild(btnLogout); container.appendChild(btnPanel); container.appendChild(btnUser);
  },

  _renderBotonEngrane(carrusel) { if (!carrusel) return; const gear = document.createElement("button"); gear.className = "carousel-edit-btn"; gear.innerHTML = "&#9881;"; gear.title = "Editar carrusel"; gear.addEventListener("click", () => { if (window.showCarouselModal) window.showCarouselModal(); }); carrusel.appendChild(gear); },

  _renderStatusBar(session) {
    this._removeStatusBar();
    const bar = document.createElement("div"); bar.id = "status-bar"; bar.className = "status-bar";
    bar.innerHTML = `
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${session.nombre || session.firstName}</span>
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l9 4.5v7L12 18l-9-4.5v-7L12 2z"/></svg> ${session.role}</span>
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> ${session.nucleus || session.state || "—"}</span>
      <span class="status-item"><span class="online-dot"></span> Online</span>
    `;
    document.body.appendChild(bar);
  },
  _removeStatusBar() { const b = document.getElementById("status-bar"); if (b) b.remove(); },

  _renderConfigGear(container) {
    if (!container) return;
    const session = window.Auth.getSession();
    if (!session || !window.Auth.checkPermission("access_panel")) return;

    if (document.getElementById("config-gear-btn")) return;
    const gearBtn = document.createElement("button"); gearBtn.id = "config-gear-btn"; gearBtn.className = "btn-nav btn-config";
    gearBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    gearBtn.title = "Configuración"; gearBtn.style.background="transparent"; gearBtn.style.color="white"; gearBtn.style.border="none"; gearBtn.style.cursor="pointer"; gearBtn.style.fontSize="1.2rem";
    container.appendChild(gearBtn);

    const overlay = document.createElement("div"); overlay.id = "config-overlay"; overlay.className = "config-overlay"; overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="config-panel">
        <button class="modal-close-btn" id="config-close-btn">&times;</button>
        <h2>Configuración</h2>
        <div class="config-content">
          <div class="config-section"><h3>Estadísticas</h3><div id="config-stats">Cargando...</div></div>
          <div class="config-section"><h3>Preferencias</h3><label><input type="checkbox" id="dark-mode-toggle-config"> Modo oscuro</label></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeConfig = () => { overlay.style.display = "none"; if (this._configUnsub) { this._configUnsub(); this._configUnsub = null; } };
    gearBtn.addEventListener("click", (e) => { e.stopPropagation(); overlay.style.display = "flex"; this._loadConfigStats(); });
    document.getElementById("config-close-btn").addEventListener("click", closeConfig);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeConfig(); });
    document.getElementById("dark-mode-toggle-config").addEventListener("change", (e) => {
      document.body.classList.toggle("dark-mode", e.target.checked);
      localStorage.setItem("darkMode", e.target.checked);
    });
    if (localStorage.getItem("darkMode") === "true") {
      document.body.classList.add("dark-mode");
      document.getElementById("dark-mode-toggle-config").checked = true;
    }
  },

  async _loadConfigStats() {
    const statsDiv = document.getElementById("config-stats");
    statsDiv.innerHTML = "Cargando estadísticas...";
    const q = query(collection(db, "usuarios"), where("isOnline", "==", true));
    this._configUnsub = onSnapshot(q, (snap) => {
      let html = "<ul>";
      const roles = {};
      snap.forEach(doc => { const r = doc.data().rango || "desconocido"; roles[r] = (roles[r] || 0) + 1; });
      for (const [rol, count] of Object.entries(roles)) html += `<li>${rol}: ${count}</li>`;
      html += "</ul>";
      statsDiv.innerHTML = html;
    });
  },

  _initLivePanel() {
    if (this._livePanelUnsub) { this._livePanelUnsub(); this._livePanelUnsub = null; }
    const q = query(collection(db, "usuarios"), where("isOnline", "==", true));
    this._livePanelUnsub = onSnapshot(q, (snapshot) => {
      const tbody = document.querySelector("#online-users-table tbody"); if (!tbody) return; tbody.innerHTML = "";
      snapshot.forEach((doc) => { const u = doc.data(); const row = tbody.insertRow(); row.innerHTML = `<td><span class="online-dot"></span> ${u.nombre || "Sin nombre"}</td><td>${u.rango || "—"}</td><td>${u.agrupacion || "—"}</td>`; });
    });
  }
};

// 🚀 Inicialización directa (sin DOMContentLoaded)
window.UI.render();
