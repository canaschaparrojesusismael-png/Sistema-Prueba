import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

window.UI = {
  _configUnsub: null,

  render() {
    const loginArea = document.getElementById("login-area");
    const userNav = document.getElementById("user-nav");
    
    // PRIORIDAD: Si existe userNav, úsalo. Si no, cae en loginArea.
    const target = userNav || loginArea; 
    const carrusel = document.getElementById("carousel-container");

    if (target) target.innerHTML = "";
    if (carrusel) { const old = carrusel.querySelector(".carousel-edit-btn"); if (old) old.remove(); }

    // v3.0 (G-11): botón de menú "hamburguesa" para pantallas angostas —
    // se inserta una sola vez como hermano de #user-nav (no adentro, para
    // que sobreviva al target.innerHTML="" de arriba en cada re-render).
    if (userNav && !userNav.parentElement.querySelector(".btn-menu-movil")) {
      const btnMenu = document.createElement("button");
      btnMenu.type = "button";
      btnMenu.className = "btn-menu-movil";
      btnMenu.setAttribute("aria-label", "Abrir menú");
      btnMenu.innerHTML = '<i class="fa-solid fa-bars"></i>';
      userNav.classList.add("menu-movil-cerrado");
      btnMenu.addEventListener("click", () => {
        const abierto = userNav.classList.toggle("menu-movil-abierto");
        userNav.classList.toggle("menu-movil-cerrado", !abierto);
        btnMenu.innerHTML = abierto ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
      });
      userNav.parentElement.insertBefore(btnMenu, userNav);
    }

    const session = window.Auth?.getSession();

    if (!session) {
      if (target) target.innerHTML = `<a href="login.html" class="btn btn-nav btn-login">Iniciar Sesión</a>`;
      this._renderNucleoHeader(null);
    } else {
      this._renderAutenticado(session, target);
      // El carrusel de index.html es el NACIONAL: solo Owner Supremo / Director Nacional lo editan.
      const puedeEditarCarruselNacional = ["owner_supremo", "director_nacional"].includes(session.role);
      if (puedeEditarCarruselNacional) this._renderBotonEngrane(carrusel);
      // v3.1: se saco la barra flotante que mostraba nombre/rol/nucleo
      // fijos en pantalla todo el tiempo (this._renderStatusBar) -- era
      // el mismo dato ya disponible al abrir el menu de usuario, asi
      // que quedaba duplicado y de mas.
      this._renderPreviewBanner();
      this._renderNucleoHeader(session);
    }
  },

  // v3.0 (P-17): mostrar el núcleo activo directamente en la barra
  // superior (antes solo se veía adentro del menú de usuario, así que
  // había que abrirlo para confirmarlo).
  _renderNucleoHeader(session) {
    const header = document.querySelector("header.barra-superior");
    let badge = document.getElementById("nucleo-header-badge");
    if (!session || !session.nucleus) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "nucleo-header-badge";
      badge.className = "nucleo-header-badge";
      const userNav = document.getElementById("user-nav");
      if (userNav?.parentElement) userNav.parentElement.insertBefore(badge, document.querySelector(".btn-menu-movil") || userNav);
      else if (header) header.appendChild(badge);
    }
    badge.innerHTML = `<i class="fa-solid fa-building-columns" aria-hidden="true"></i> ${session.nucleus}`;
  },

  _renderPreviewBanner() {
    const existente = document.getElementById("preview-mode-banner");
    const real = window.Auth?.getRealSession?.();
    const preview = real?.role === "owner_supremo" ? window.Auth.getPreviewOverride() : null;
    if (!preview) { if (existente) existente.remove(); return; }
    if (existente) return;
    const banner = document.createElement("div");
    banner.id = "preview-mode-banner";
    banner.className = "preview-mode-banner";
    const label = window.Auth?.ROLES?.[preview.role]?.label || preview.role;
    banner.innerHTML = `<i class="fa-solid fa-eye"></i> Viendo el sitio como <strong>${label}${preview.nucleus ? " · " + preview.nucleus : ""}</strong> — es solo una vista de prueba.
      <button type="button" id="btn-salir-preview-banner">Volver a mi vista real</button>`;
    document.body.prepend(banner);
    document.getElementById("btn-salir-preview-banner").addEventListener("click", () => {
      window.Auth.clearPreviewOverride();
      window.location.href = "panel.html";
    });
  },

  _renderAutenticado(session, container) {
    if (!container) return;
    const btnLogout = document.createElement("button"); btnLogout.className = "btn btn-nav btn-cerrar"; btnLogout.textContent = "Cerrar Sesión"; btnLogout.addEventListener("click", () => window.Auth.logout());
    const rutasProtegidas = ["panel.html", "piezas.html", "formacion.html", "miembros.html", "repertorio.html"];
    const enPanel = rutasProtegidas.some(r => location.pathname.includes(r));
    const btnPanel = document.createElement("a"); btnPanel.href = enPanel ? "index.html" : "panel.html"; btnPanel.className = "btn btn-nav btn-panel"; btnPanel.textContent = enPanel ? "Volver al inicio" : "Acceder a la página";

    const initial = window._iniciales ? window._iniciales(session.nombre || session.firstName) : (session.firstName?.charAt(0) || session.nombre?.charAt(0) || "?").toUpperCase();
    const btnUser = document.createElement("div"); btnUser.className = "btn btn-nav btn-user"; btnUser.tabIndex = 0;
    // v3.0 (G-12): color de avatar derivado del rol — mismo color en la
    // barra superior, Configuración y Miembros, para reconocer de un
    // vistazo con quién se está tratando.
    if (window._colorPorRol) btnUser.style.background = window._colorPorRol(session.role);
    btnUser.innerHTML = `<span>${initial}</span>`;

    const nombreCompleto = session.nombre || `${session.firstName || ""} ${session.lastName || ""}`.trim() || "Usuario";
    const rolLabel = window.Auth?.ROLES?.[session.role]?.label || session.role || "—";
    const submenu = document.createElement("div"); submenu.className = "user-submenu";
    submenu.innerHTML = `
      <p class="user-submenu-nombre">${nombreCompleto}</p>
      <p class="user-submenu-dato"><i class="fa-solid fa-shield-halved"></i> ${rolLabel}</p>
      <p class="user-submenu-dato"><i class="fa-solid fa-building-columns"></i> ${session.nucleus || session.group || "—"}</p>
      <p class="user-submenu-dato"><i class="fa-solid fa-circle" style="color:var(--color-exito);font-size:0.5rem;"></i> Conectado</p>
      <hr class="user-submenu-sep"/>
      <button type="button" id="config-gear-btn" class="user-submenu-item"><i class="fa-solid fa-gear"></i> Configuración</button>
    `;

    // v3.1: antes tambien abria/cerraba con mouseenter/mouseleave.
    // Eso podia cerrar el submenu justo cuando el mouse pasaba del
    // boton del avatar hacia una opcion de adentro (como "Configuracion"),
    // por el hueco entre ambos elementos -- lo dejaba casi imposible de
    // usar con mouse en ciertas resoluciones. Ahora es solo click/touch,
    // igual en escritorio, tablet y celular, y se cierra con click afuera
    // o con Escape.
    const abrir = () => submenu.classList.add("visible");
    const cerrar = () => submenu.classList.remove("visible");
    btnUser.addEventListener("click", (e) => { e.stopPropagation(); submenu.classList.toggle("visible"); });
    document.addEventListener("click", (e) => { if (!btnUser.contains(e.target)) cerrar(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });

    btnUser.appendChild(submenu);
    container.appendChild(btnLogout); container.appendChild(btnPanel); container.appendChild(btnUser);

    // El botón de Configuración vive dentro del menú de usuario
    this._wireConfigGear(submenu.querySelector("#config-gear-btn"));
  },

  _renderBotonEngrane(carrusel) {
    if (!carrusel) return;
    const anterior = carrusel.querySelector(".carousel-edit-btn");
    if (anterior) anterior.remove(); // evita duplicados si render() corre más de una vez
    const gear = document.createElement("button"); gear.className = "carousel-edit-btn"; gear.type = "button"; gear.innerHTML = '<i class="fa-solid fa-pen"></i>'; gear.title = "Editar carrusel";
    gear.addEventListener("click", () => { if (window.showCarouselModal) window.showCarouselModal(); else console.warn("showCarouselModal aún no está listo (¿main.js cargó bien?)"); });
    carrusel.appendChild(gear);
  },

  // v3.1: this._renderStatusBar()/_removeStatusBar() se sacaron de aca
  // (ver nota en render()) -- mostraban nombre/rol/nucleo/online fijos
  // en una barra flotante en TODAS las paginas, duplicando lo que ya
  // se ve al abrir el menu de la cuenta.

  _wireConfigGear(gearBtn) {
    if (!gearBtn) return;

    // El overlay de configuración se crea una sola vez en toda la página
    let overlay = document.getElementById("config-overlay");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "config-overlay"; overlay.className = "config-overlay"; overlay.style.display = "none";
      overlay.innerHTML = `
        <div class="config-panel">
          <button class="modal-close-btn" id="config-close-btn">&times;</button>
          <h2><i class="fa-solid fa-gear"></i> Configuración ⚙️</h2>

          <!-- v3.0 (G-13): pestañas en vez de una sola columna larga con
               scroll — más fácil de escanear y deja lugar para que se sigan
               agregando secciones sin que la ventana crezca sin límite. -->
          <div class="config-tabs" role="tablist">
            <button type="button" class="config-tab activo" data-tab="perfil" role="tab"><i class="fa-solid fa-id-card"></i> Perfil</button>
            <button type="button" class="config-tab" data-tab="apariencia" role="tab"><i class="fa-solid fa-palette"></i> Apariencia</button>
            <!-- v3.1: se sacó la pestaña "Notificaciones" — no hacía nada
                 (los switches estaban todos deshabilitados, era un stub
                 para una función que todavía no existe). -->
            <button type="button" class="config-tab" data-tab="cuenta" role="tab"><i class="fa-solid fa-user-shield"></i> Cuenta</button>
          </div>

          <div class="config-content">

            <!-- ============ PESTAÑA: PERFIL ============ -->
            <div class="config-panel-seccion activa" data-panel="perfil">
              <div class="config-section" id="config-preview-banner-wrap" style="display:none;">
                <div class="config-preview-banner">
                  <i class="fa-solid fa-eye"></i>
                  <span id="config-preview-text"></span>
                  <button type="button" id="btn-salir-preview" class="btn-config-mini">Volver a mi vista real</button>
                </div>
              </div>

              <div class="config-section config-perfil-card">
                <div class="config-perfil-header">
                  <div class="config-perfil-avatar" id="config-perfil-avatar">?</div>
                  <div class="config-perfil-header-datos">
                    <div class="config-perfil-header-nombre" id="config-perfil-nombre">—</div>
                    <div class="config-perfil-header-rol"><i id="config-perfil-rol-icono" class="fa-solid fa-user"></i> <span id="config-perfil-rol">—</span></div>
                  </div>
                </div>
                <div class="config-field">
                  <label><i class="fa-solid fa-music"></i> Agrupación</label>
                  <div class="config-valor-solo-lectura" id="config-perfil-agrupacion">—</div>
                </div>
                <!-- v3.0 (P-22): última sesión anterior a esta -->
                <div class="config-field">
                  <label><i class="fa-solid fa-clock-rotate-left"></i> Última sesión</label>
                  <div class="config-valor-solo-lectura" id="config-perfil-ultima-sesion">—</div>
                </div>
                <!-- v3.0 (P-21): copiar correo/UID para tickets de soporte -->
                <button type="button" id="btn-copiar-perfil" class="btn-config-mini" style="margin-top:0.6rem;">
                  <i class="fa-solid fa-copy"></i> Copiar mi correo y UID
                </button>
                <!-- v3.1: se saco el aviso de "pedile a un director/admin que
                     te cambie el nombre o la agrupacion desde Miembros" que
                     iba aca. -->
              </div>
            </div>

            <!-- ============ PESTAÑA: APARIENCIA ============ -->
            <div class="config-panel-seccion" data-panel="apariencia">
              <div class="config-section">
                <h3><i class="fa-solid fa-sliders"></i> Preferencias visuales</h3>
                <label class="config-switch-row" for="dark-mode-toggle-config">
                  <span><i class="fa-solid fa-moon"></i> Modo oscuro</span>
                  <span class="config-switch">
                    <input type="checkbox" id="dark-mode-toggle-config">
                    <span class="config-switch-slider"></span>
                  </span>
                </label>
                <p class="config-hint">🖥️ Se aplica en todas las páginas del sitio, no solo en esta.</p>
              </div>
            </div>

            <!-- v3.1: se saco por completo la pestana "Notificaciones"
                 (G-14 de v3.0) -- todos los switches estaban
                 deshabilitados, era un stub sin funcion real. -->

            <!-- ============ PESTAÑA: CUENTA ============ -->
            <div class="config-panel-seccion" data-panel="cuenta">
              <div class="config-section">
                <h3><i class="fa-solid fa-chart-simple"></i> Conectados ahora</h3>
                <div id="config-stats"><p class="config-hint">Cargando…</p></div>
              </div>

              <div class="config-section" id="config-preview-section" style="display:none;">
                <h3><i class="fa-solid fa-user-secret"></i> Modo de prueba</h3>
                <p class="config-hint">👀 Solo vos ves el sitio distinto — no cambia tu cuenta real ni la de nadie más.</p>
                <div class="config-field">
                  <label>Ver como rol</label>
                  <select id="config-preview-rol" class="modal-input">
                    <option value="owner_supremo">👑 Owner Supremo</option>
                    <option value="director_nacional">🚩 Director Nacional</option>
                    <option value="director_regional">🗺️ Director Regional</option>
                    <option value="director_nucleo">🏛️ Director de Núcleo</option>
                    <option value="admin">🛠️ Administrador</option>
                    <option value="profesor">🎓 Profesor</option>
                    <option value="estudiante">🎻 Estudiante</option>
                  </select>
                </div>
                <div class="config-field">
                  <label>Núcleo simulado (opcional)</label>
                  <select id="config-preview-nucleo" class="modal-input"><option value="">— Ninguno —</option></select>
                </div>
                <button type="button" id="btn-aplicar-preview" class="btn btn-submit config-btn-full">Aplicar vista previa</button>
              </div>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // v3.0 (G-13): cambio de pestaña
      overlay.querySelectorAll(".config-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          overlay.querySelectorAll(".config-tab").forEach(t => t.classList.remove("activo"));
          overlay.querySelectorAll(".config-panel-seccion").forEach(p => p.classList.remove("activa"));
          tab.classList.add("activo");
          overlay.querySelector(`.config-panel-seccion[data-panel="${tab.dataset.tab}"]`)?.classList.add("activa");
        });
      });

      const closeConfig = () => { overlay.style.display = "none"; if (this._configUnsub) { this._configUnsub(); this._configUnsub = null; } };
      document.getElementById("config-close-btn").addEventListener("click", closeConfig);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeConfig(); });
      document.getElementById("dark-mode-toggle-config").addEventListener("change", (e) => {
        document.documentElement.classList.toggle("dark-mode", e.target.checked);
        localStorage.setItem("darkMode", e.target.checked);
      });
      if (localStorage.getItem("darkMode") === "true") {
        document.documentElement.classList.add("dark-mode");
        document.getElementById("dark-mode-toggle-config").checked = true;
      }

      // ---- Modo de prueba (solo Owner Supremo real) — v3.0 (P-24): ahora
      // pide una confirmación explícita antes de aplicar, para evitar
      // activarlo sin querer.
      document.getElementById("btn-aplicar-preview").addEventListener("click", async () => {
        const rol = document.getElementById("config-preview-rol").value;
        const nucleo = document.getElementById("config-preview-nucleo").value;
        const rolLabel = window.Auth?.ROLES?.[rol]?.label || rol;
        const ok = await window._confirmDialog(
          `Vas a ver el sitio como <strong>${rolLabel}</strong>${nucleo ? " en el núcleo <strong>" + nucleo + "</strong>" : ""}. No cambia tu cuenta real ni la de nadie más — solo lo que ves vos en este navegador.`,
          { titulo: "¿Aplicar vista previa?", textoOk: "Sí, aplicar" }
        );
        if (!ok) return;
        if (window.Auth.setPreviewOverride(rol, nucleo)) {
          window._showToast?.(`Viendo el sitio como ${rolLabel}${nucleo ? " · " + nucleo : ""}`, "success");
          window.location.href = "panel.html";
        }
      });
      document.getElementById("btn-salir-preview").addEventListener("click", () => {
        window.Auth.clearPreviewOverride();
        window._showToast?.("Volviste a tu vista real (Owner Supremo)", "success");
        window.location.href = "panel.html";
      });

      // v3.0 (P-21): copiar correo + UID en un solo clic, útil para tickets
      // de soporte ("mandame tu UID") sin tener que ir a buscarlo a mano.
      document.getElementById("btn-copiar-perfil").addEventListener("click", async () => {
        const real = window.Auth.getRealSession();
        const texto = `Correo: ${real?.email || "—"}\nUID: ${real?.uid || "—"}`;
        try {
          await navigator.clipboard.writeText(texto);
          window._showToast?.("Correo y UID copiados al portapapeles", "success");
        } catch {
          window._showToast?.("No se pudo copiar automáticamente — copialo a mano: " + texto, "error");
        }
      });
    }

    gearBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      // v3.1: cerramos el menu del avatar de forma explicita al abrir
      // Configuracion, en vez de dejarlo "visible" tapado atras del
      // overlay.
      document.querySelector(".user-submenu")?.classList.remove("visible");
      overlay.style.display = "flex";
      this._loadConfigStats();
      await this._llenarPerfilYPreview();
    });
  },

  async _llenarPerfilYPreview() {
    const real = window.Auth.getRealSession();
    if (!real) return;

    // Perfil: siempre datos reales, no los de una vista previa
    try {
      const snap = await getDoc(doc(db, "usuarios", real.uid));
      const data = snap.exists() ? snap.data() : {};
      const nombre = data.nombre || real.nombre || "—";
      document.getElementById("config-perfil-nombre").textContent = nombre;
      document.getElementById("config-perfil-agrupacion").textContent = data.agrupacion || "— (sin asignar)";
      document.getElementById("config-perfil-rol").textContent = window.Auth?.ROLES?.[real.role]?.label || real.role || "—";
      document.getElementById("config-perfil-rol-icono").className = window.Auth?.ROLES?.[real.role]?.icon || "fa-solid fa-user";
      const avatarEl = document.getElementById("config-perfil-avatar");
      avatarEl.textContent = window._iniciales ? window._iniciales(nombre) : (nombre.charAt(0) || "?").toUpperCase();
      // v3.0 (G-12): color de avatar derivado del rol, igual que en la
      // barra superior y Miembros — reconocible de un vistazo.
      avatarEl.style.background = window._colorPorRol ? window._colorPorRol(real.role) : "";
      // v3.0 (P-22): última sesión ANTERIOR a esta (guardada en el login).
      const ultimaSesionEl = document.getElementById("config-perfil-ultima-sesion");
      if (ultimaSesionEl) {
        ultimaSesionEl.textContent = real.previousLogin
          ? new Date(real.previousLogin).toLocaleString("es-VE", { dateStyle: "long", timeStyle: "short" })
          : "Esta es tu primera sesión registrada";
      }
    } catch (err) { console.error("No se pudo leer el perfil:", err); }

    // Banner de "estás viendo como X"
    const preview = real.role === "owner_supremo" ? window.Auth.getPreviewOverride() : null;
    const bannerWrap = document.getElementById("config-preview-banner-wrap");
    if (preview) {
      document.getElementById("config-preview-text").textContent =
        `Estás viendo el sitio como ${window.Auth.ROLES?.[preview.role]?.label || preview.role}${preview.nucleus ? " · " + preview.nucleus : ""}`;
      bannerWrap.style.display = "block";
    } else {
      bannerWrap.style.display = "none";
    }

    // Sección de modo de prueba: solo visible para el Owner Supremo REAL
    const previewSection = document.getElementById("config-preview-section");
    if (real.role !== "owner_supremo") { previewSection.style.display = "none"; return; }
    previewSection.style.display = "block";
    try {
      const snap = await getDocs(collection(db, "nucleos"));
      const nombres = [...new Set(snap.docs.map(d => d.data().nombre))].sort();
      const sel = document.getElementById("config-preview-nucleo");
      sel.innerHTML = `<option value="">— Ninguno —</option>` + nombres.map(n => `<option value="${n}">${n}</option>`).join("");
    } catch (err) { console.error("No se pudo cargar núcleos para el modo de prueba:", err); }
  },

  async _loadConfigStats() {
    const statsDiv = document.getElementById("config-stats");
    statsDiv.innerHTML = '<p class="config-hint">Cargando…</p>';
    const q = query(collection(db, "usuarios"), where("isOnline", "==", true));
    this._configUnsub = onSnapshot(q, (snap) => {
      // CORREGIDO 2026-09-06: antes esto mostraba una lista pelada con la
      // clave interna del rol tal cual está en la base de datos (ej.
      // "director_nucleo: 2"), sin ningún ícono ni el nombre legible que ya
      // existe en ROLES. Ahora usa el mismo ícono y etiqueta que el resto
      // del sitio, en tarjetitas en vez de una lista simple.
      const roles = {};
      snap.forEach(doc => { const r = doc.data().rango || "desconocido"; roles[r] = (roles[r] || 0) + 1; });
      const total = snap.size;
      if (total === 0) {
        statsDiv.innerHTML = '<p class="config-hint">😴 Nadie conectado en este momento.</p>';
        return;
      }
      const filas = Object.entries(roles)
        .sort((a, b) => (window.Auth?.ROLES?.[a[0]]?.level ?? 99) - (window.Auth?.ROLES?.[b[0]]?.level ?? 99))
        .map(([rol, count]) => {
          const info = window.Auth?.ROLES?.[rol];
          return `<div class="config-stat-fila">
            <span class="config-stat-rol"><i class="${info?.icon || "fa-solid fa-user"}"></i> ${info?.label || rol}</span>
            <span class="config-stat-count">${count}</span>
          </div>`;
        }).join("");
      statsDiv.innerHTML = `
        <p class="config-stat-total"><span class="online-dot"></span> ${total} conectado${total === 1 ? "" : "s"} ahora</p>
        ${filas}`;
    });
  }
};

// Inicialización directa (módulo ES)
try {
  window.UI.render();
} catch (err) {
  // Si algo rompe acá, es EXACTAMENTE el tipo de error que deja a la gente sin
  // poder iniciar sesión sin ninguna pista. Lo mostramos fuerte en consola y
  // dejamos un botón de emergencia para que el login nunca quede bloqueado.
  console.error("💥 window.UI.render() falló — esto es lo que impide ver el botón de Iniciar Sesión:", err);
  const target = document.getElementById("user-nav") || document.getElementById("login-area");
  if (target && !target.innerHTML.trim()) {
    target.innerHTML = `<a href="login.html" class="btn btn-nav btn-login">Iniciar Sesión</a>`;
  }
}
