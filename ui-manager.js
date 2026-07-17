import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

window.UI = {
  render() {
    const loginArea = document.getElementById("login-area");
    const userNav = document.getElementById("user-nav");
    const target = loginArea || userNav;
    const carrusel = document.getElementById("carousel-container");

    if (target) target.innerHTML = "";
    if (carrusel) {
      const oldGear = carrusel.querySelector(".carousel-edit-btn");
      if (oldGear) oldGear.remove();
    }

    const session = window.Auth?.getSession();

    if (!session) {
      if (target) {
        target.innerHTML = `<a href="login.html" class="btn btn-login">Iniciar Sesión</a>`;
      }
    } else {
      this._renderAutenticado(session, target);
      if (window.Auth.checkPermission("edit_carousel")) {
        this._renderBotonEngrane(carrusel);
      }
      this._renderConfigGear(target);
      if (window.Auth.checkPermission("manage_users")) {
        this._initLivePanel();
      }
    }
  },

  _renderAutenticado(session, container) {
    if (!container) return;

    const btnLogout = document.createElement("button");
    btnLogout.className = "btn btn-nav btn-cerrar";
    btnLogout.textContent = "Cerrar Sesión";
    btnLogout.addEventListener("click", () => window.Auth.logout());

    const rutasProtegidas = ["panel.html", "piezas.html", "formacion.html", "miembros.html"];
    const enPanel = rutasProtegidas.some(r => location.pathname.includes(r));

    const btnPanel = document.createElement("a");
    btnPanel.href = enPanel ? "index.html" : "panel.html";
    btnPanel.className = "btn btn-nav btn-panel";
    btnPanel.textContent = enPanel ? "Volver al inicio" : "Acceder a la página";

    const initial = (session.firstName?.charAt(0) || "?").toUpperCase();
    const btnUser = document.createElement("button");
    btnUser.className = "btn btn-nav btn-user";
    btnUser.textContent = initial;
    btnUser.type = "button";

    const submenu = document.createElement("div");
    submenu.className = "user-submenu";
    submenu.innerHTML = `
      <p><strong>${session.nombre || session.firstName + " " + (session.lastName || "")}</strong></p>
      <p>Rol: ${session.role}</p>
      <p>Agrupación: ${session.group || "—"}</p>
      <p>Conectado</p>
    `;
    submenu.style.display = "none";
    btnUser.appendChild(submenu);

    btnUser.addEventListener("mouseenter", () => submenu.style.display = "block");
    btnUser.addEventListener("mouseleave", () => submenu.style.display = "none");
    submenu.addEventListener("mouseenter", () => submenu.style.display = "block");
    submenu.addEventListener("mouseleave", () => submenu.style.display = "none");

    container.appendChild(btnLogout);
    container.appendChild(btnPanel);
    container.appendChild(btnUser);
  },

  _renderBotonEngrane(carrusel) {
    if (!carrusel) return;
    const gear = document.createElement("button");
    gear.className = "carousel-edit-btn";
    gear.innerHTML = "&#9881;";
    gear.title = "Editar carrusel";
    gear.addEventListener("click", () => {
      if (window.showCarouselModal) window.showCarouselModal();
    });
    carrusel.appendChild(gear);
  },

  _renderConfigGear(container) {
    if (!container) return;
    const session = window.Auth.getSession();
    if (!session) return;

    const gearBtn = document.createElement("button");
    gearBtn.className = "btn-nav btn-config";
    gearBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    gearBtn.title = "Configuración";
    gearBtn.style.background = "transparent";
    gearBtn.style.color = "white";
    gearBtn.style.border = "none";
    gearBtn.style.cursor = "pointer";
    gearBtn.style.fontSize = "1.2rem";

    const dropdown = document.createElement("div");
    dropdown.className = "config-dropdown";
    dropdown.style.display = "none";
    dropdown.innerHTML = this._buildConfigMenu(session);

    gearBtn.appendChild(dropdown);
    gearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", () => dropdown.style.display = "none");

    container.appendChild(gearBtn);
  },

  _buildConfigMenu(session) {
    let html = `<div class="config-menu">`;
    html += `<p class="config-title">Configuración</p>`;

    if (session.role === "owner_supremo") {
      html += `<p>Estadísticas globales:</p>`;
      html += `<button onclick="UI._showGlobalStats()">Ver todas las conexiones</button>`;
      html += `<button onclick="UI._switchNucleo()">Cambiar vista de núcleo</button>`;
      html += `<button onclick="UI._debugMode()">Modo Debug</button>`;
    }

    if (["director_nacional", "director_regional"].includes(session.role)) {
      html += `<p>Estadísticas de región:</p>`;
      html += `<button onclick="UI._showRegionStats()">Ver conexiones de mi región</button>`;
    }

    if (["director_nucleo", "admin", "owner_supremo"].includes(session.role)) {
      html += `<p>Gestión de núcleo:</p>`;
      html += `<button onclick="UI._manageNucleo()">Administrar núcleo</button>`;
    }

    html += `<hr>`;
    html += `<label><input type="checkbox" id="dark-mode-toggle" onchange="UI._toggleDarkMode()"> Modo oscuro</label>`;
    html += `</div>`;
    return html;
  },

  _initLivePanel() {
    if (window._livePanelUnsub) {
      window._livePanelUnsub();
      window._livePanelUnsub = null;
    }

    const q = query(collection(db, "usuarios"), where("isOnline", "==", true));
    window._livePanelUnsub = onSnapshot(q, (snapshot) => {
      const tbody = document.querySelector("#online-users-table tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      snapshot.forEach((doc) => {
        const u = doc.data();
        const row = tbody.insertRow();
        row.innerHTML = `
          <td><span class="online-dot"></span> ${u.nombre || "Sin nombre"}</td>
          <td>${u.rango || "—"}</td>
          <td>${u.agrupacion || "—"}</td>
        `;
      });
    });
  },

  _toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
  },

  _showGlobalStats() { alert("Función de estadísticas globales (próximamente)"); },
  _switchNucleo() {
    const estado = prompt("Ingrese el estado:");
    if (estado) {
      sessionStorage.setItem("debug_nucleo_estado", estado);
      alert(`Vista cambiada a estado: ${estado}. Recargue la página.`);
    }
  },
  _debugMode() {
    alert("Modo debug activado: puedes inspeccionar la consola.");
    console.log("Sesión actual:", window.Auth.getSession());
  }
};

document.addEventListener("DOMContentLoaded", () => window.UI.render());
