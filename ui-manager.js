/**
 * ui-manager.js – Gestión dinámica de UI (Firebase Edition)
 * Sistema Nacional de Orquestas
 */
(function () {
  "use strict";

  function renderizarUI() {
    const loginArea = document.getElementById("login-area");
    const userNav = document.getElementById("user-nav");
    const targetContainer = loginArea || userNav;
    const carrusel = document.getElementById("carousel-container");

    if (targetContainer) targetContainer.innerHTML = "";
    if (carrusel) {
      const oldGear = carrusel.querySelector(".carousel-edit-btn");
      if (oldGear) oldGear.remove();
    }

    const session = Auth.getSession();

    if (!session) {
      if (targetContainer) {
        targetContainer.innerHTML = `<a href="login.html" class="btn btn-login">Iniciar Sesión</a>`;
      }
    } else {
      renderAutenticado(session, targetContainer);
      if ((session.role === "owner" || session.role === "admin") && Auth.hasPermission("edit_carousel")) {
        renderBotonEngrane(carrusel);
      }
    }
  }

  function renderAutenticado(session, container) {
    if (!container) return;

    const btnLogout = document.createElement("button");
    btnLogout.className = "btn btn-nav btn-cerrar";
    btnLogout.textContent = "Cerrar Sesión";
    btnLogout.addEventListener("click", () => Auth.logout());

    const rutasProtegidas = ["panel.html", "piezas.html", "formacion.html", "miembros.html"];
    const estaEnPanel = rutasProtegidas.some(ruta => window.location.pathname.includes(ruta));

    const btnPanel = document.createElement("a");
    btnPanel.href = estaEnPanel ? "index.html" : "panel.html";
    btnPanel.className = "btn btn-nav btn-panel";
    btnPanel.textContent = estaEnPanel ? "Volver al inicio" : "Acceder a la página";

    const initial = session.firstName?.charAt(0)?.toUpperCase() || "?";
    const btnUser = document.createElement("button");
    btnUser.className = "btn btn-nav btn-user";
    btnUser.textContent = initial;
    btnUser.setAttribute("type", "button");

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

    btnUser.addEventListener("mouseenter", () => { submenu.style.display = "block"; });
    btnUser.addEventListener("mouseleave", () => { submenu.style.display = "none"; });
    submenu.addEventListener("mouseenter", () => { submenu.style.display = "block"; });
    submenu.addEventListener("mouseleave", () => { submenu.style.display = "none"; });

    container.appendChild(btnLogout);
    container.appendChild(btnPanel);
    container.appendChild(btnUser);
  }

  function renderBotonEngrane(carrusel) {
    if (!carrusel) return;
    const gearBtn = document.createElement("button");
    gearBtn.className = "carousel-edit-btn";
    gearBtn.innerHTML = "&#9881;";
    gearBtn.title = "Editar carrusel";
    gearBtn.addEventListener("click", () => { if (window.showCarouselModal) window.showCarouselModal(); });
    carrusel.appendChild(gearBtn);
  }

  window.UI = { render: renderizarUI };
})();
