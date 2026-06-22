/**
 * ui-manager.js – Renderizado UI + Panel Admin en vivo
 */
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========== RENDERIZADO PRINCIPAL ==========
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

    const session = window.Auth.getSession();

    if (!session) {
      if (target) {
        target.innerHTML = `<a href="login.html" class="btn btn-login">Iniciar Sesión</a>`;
      }
    } else {
      this._renderAutenticado(session, target);
      if ((session.role === "owner" || session.role === "admin") && window.Auth.hasPermission("edit_carousel")) {
        this._renderBotonEngrane(carrusel);
      }
      // Si es admin, iniciamos panel en vivo
      if (session.role === "owner" || session.role === "admin") {
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

  // ========== PANEL EN VIVO ==========
  _initLivePanel() {
    const db = getFirestore(window.Auth.db.app);
    const q = query(collection(db, "usuarios"), where("isOnline", "==", true));
    onSnapshot(q, (snapshot) => {
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
  }
};

// Inicializar UI cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => window.UI.render());
