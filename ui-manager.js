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
      if (session.role === "Administrativo" && Auth.hasPermission("edit_carousel")) {
        renderBotonEngrane(carrusel);
      }
    }
  }

  function renderAutenticado(session, container) {
    if (!container) return;

    // Cerrar Sesión
    const btnLogout = document.createElement("button");
    btnLogout.className = "btn btn-nav btn-cerrar";
    btnLogout.textContent = "Cerrar Sesión";
    btnLogout.addEventListener("click", () => Auth.logout());

    // Botón central contextual
    const rutasProtegidas = ["panel.html", "piezas.html", "formacion.html", "miembros.html"];
    const estaEnPanel = rutasProtegidas.some(ruta => window.location.pathname.includes(ruta));

    const btnPanel = document.createElement("a");
    btnPanel.href = estaEnPanel ? "index.html" : "panel.html";
    btnPanel.className = "btn btn-nav btn-panel";
    btnPanel.textContent = estaEnPanel ? "Volver al inicio" : "Acceder a la página";

    // Inicial del usuario
    const initial = session.firstName.charAt(0).toUpperCase();
    const btnUser = document.createElement("button");
    btnUser.className = "btn btn-nav btn-user";
    btnUser.textContent = initial;
    btnUser.setAttribute("type", "button");

    const submenu = document.createElement("div");
    submenu.className = "user-submenu";
    submenu.innerHTML = `
      <p><strong>${session.firstName} ${session.lastName}</strong></p>
      <p>Edad: ${session.age} años</p>
      <p>Rol: ${session.role}</p>
      <p>Agrupación: ${session.group}</p>
      <p>Estado: ${session.state}</p>
      <p>Núcleo: ${session.nucleus}</p>
      <p>Conectado hace: ${formatTime(session.loginTime)}</p>
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

  function formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "menos de 1 min";
    return `${mins} minuto(s)`;
  }

  window.UI = { render: renderizarUI };
})();