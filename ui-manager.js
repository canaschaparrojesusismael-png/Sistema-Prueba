import { db } from "./firebase-init.js";
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

window.UI = {
  _configUnsub: null,
  _livePanelUnsub: null,

  render() {
    const loginArea = document.getElementById("login-area");
    const userNav = document.getElementById("user-nav");
    
    // PRIORIDAD: Si existe userNav, úsalo. Si no, cae en loginArea.
    const target = userNav || loginArea; 
    const carrusel = document.getElementById("carousel-container");

    if (target) target.innerHTML = "";
    if (carrusel) { const old = carrusel.querySelector(".carousel-edit-btn"); if (old) old.remove(); }

    const session = window.Auth?.getSession();

    if (!session) {
      if (target) target.innerHTML = `<a href="login.html" class="btn btn-nav btn-login">Iniciar Sesión</a>`;
      this._removeStatusBar();
    } else {
      this._renderAutenticado(session, target);
      // El carrusel de index.html es el NACIONAL: solo Owner Supremo / Director Nacional lo editan.
      const puedeEditarCarruselNacional = ["owner_supremo", "director_nacional"].includes(session.role);
      if (puedeEditarCarruselNacional) this._renderBotonEngrane(carrusel);
      this._renderStatusBar(session);
      this._renderPreviewBanner();
      if (window.Auth?.checkPermission && window.Auth.checkPermission("manage_users")) this._initLivePanel();
    }
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

  _renderAutenticado(session, container) {
    if (!container) return;
    const btnLogout = document.createElement("button"); btnLogout.className = "btn btn-nav btn-cerrar"; btnLogout.textContent = "Cerrar Sesión"; btnLogout.addEventListener("click", () => window.Auth.logout());
    const rutasProtegidas = ["panel.html", "piezas.html", "formacion.html", "miembros.html", "agrupacion-detalle.html", "repertorio.html", "cambiar-clave.html"];
    const enPanel = rutasProtegidas.some(r => location.pathname.includes(r));
    const btnPanel = document.createElement("a"); btnPanel.href = enPanel ? "index.html" : "panel.html"; btnPanel.className = "btn btn-nav btn-panel"; btnPanel.textContent = enPanel ? "Volver al inicio" : "Acceder a la página";

    const initial = (session.firstName?.charAt(0) || session.nombre?.charAt(0) || "?").toUpperCase();
    const btnUser = document.createElement("div"); btnUser.className = "btn btn-nav btn-user"; btnUser.tabIndex = 0;
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

    // Soporta hover (escritorio) y click/touch (móvil/tablet)
    const abrir = () => submenu.classList.add("visible");
    const cerrar = () => submenu.classList.remove("visible");
    btnUser.addEventListener("mouseenter", abrir);
    btnUser.addEventListener("mouseleave", cerrar);
    submenu.addEventListener("mouseenter", abrir);
    submenu.addEventListener("mouseleave", cerrar);
    btnUser.addEventListener("click", (e) => { e.stopPropagation(); submenu.classList.toggle("visible"); });
    document.addEventListener("click", (e) => { if (!btnUser.contains(e.target)) cerrar(); });

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

  _renderStatusBar(session) {
    this._removeStatusBar();
    const rolLabel = window.Auth?.ROLES?.[session.role]?.label || session.role;
    const bar = document.createElement("div"); bar.id = "status-bar"; bar.className = "status-bar";
    bar.innerHTML = `
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${session.nombre || session.firstName}</span>
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l9 4.5v7L12 18l-9-4.5v-7L12 2z"/></svg> ${rolLabel}</span>
      <span class="status-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> ${session.nucleus || session.state || "—"}</span>
      <span class="status-item"><span class="online-dot"></span> Online</span>
    `;
    document.body.appendChild(bar);
  },

  _removeStatusBar() {
    const b = document.getElementById("status-bar"); if (b) b.remove();
  },

  _wireConfigGear(gearBtn) {
    if (!gearBtn) return;

    // El overlay de configuración se crea una sola vez en toda la página
    let overlay = document.getElementById("config-overlay");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "config-overlay"; overlay.className = "config-overlay"; overlay.style.display = "none";
      overlay.innerHTML = `
        <div class="config-panel">
          <button class="modal-close-btn" id="config-close-btn">&times;</button>
          <h2><i class="fa-solid fa-gear"></i> Configuración</h2>
          <div class="config-content">

            <div class="config-section" id="config-preview-banner-wrap" style="display:none;">
              <div class="config-preview-banner">
                <i class="fa-solid fa-eye"></i>
                <span id="config-preview-text"></span>
                <button type="button" id="btn-salir-preview" class="btn-config-mini">Volver a mi vista real</button>
              </div>
            </div>

            <div class="config-section">
              <h3><i class="fa-solid fa-id-card"></i> Mi perfil</h3>
              <div class="config-field">
                <label>Nombre</label>
                <input type="text" id="config-perfil-nombre" class="modal-input" />
              </div>
              <div class="config-field">
                <label>Agrupación</label>
                <input type="text" id="config-perfil-agrupacion" class="modal-input" />
              </div>
              <button type="button" id="btn-guardar-perfil" class="btn btn-submit config-btn-full">Guardar cambios</button>
            </div>

            <div class="config-section" id="config-preview-section" style="display:none;">
              <h3><i class="fa-solid fa-user-secret"></i> Modo de prueba</h3>
              <p class="config-hint">Solo vos ves el sitio distinto — no cambia tu cuenta real ni la de nadie más.</p>
              <div class="config-field">
                <label>Ver como rol</label>
                <select id="config-preview-rol" class="modal-input">
                  <option value="owner_supremo">Owner Supremo</option>
                  <option value="director_nacional">Director Nacional</option>
                  <option value="director_regional">Director Regional</option>
                  <option value="director_nucleo">Director de Núcleo</option>
                  <option value="admin">Administrador</option>
                  <option value="profesor">Profesor</option>
                  <option value="estudiante">Estudiante</option>
                </select>
              </div>
              <div class="config-field">
                <label>Núcleo simulado (opcional)</label>
                <select id="config-preview-nucleo" class="modal-input"><option value="">— Ninguno —</option></select>
              </div>
              <button type="button" id="btn-aplicar-preview" class="btn btn-submit config-btn-full">Aplicar vista previa</button>
            </div>

            <div class="config-section">
              <h3><i class="fa-solid fa-chart-simple"></i> Conectados ahora</h3>
              <div id="config-stats">Cargando...</div>
            </div>

            <div class="config-section">
              <h3><i class="fa-solid fa-sliders"></i> Preferencias</h3>
              <label class="config-toggle"><input type="checkbox" id="dark-mode-toggle-config"> Modo oscuro</label>
              <label class="config-toggle"><input type="checkbox" id="config-notif-toggle"> Avisos por correo (próximamente)</label>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const closeConfig = () => { overlay.style.display = "none"; if (this._configUnsub) { this._configUnsub(); this._configUnsub = null; } };
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
      document.getElementById("config-notif-toggle").disabled = true;

      // ---- Guardar perfil (nombre/agrupación de la cuenta REAL, nunca la de prueba) ----
      document.getElementById("btn-guardar-perfil").addEventListener("click", async () => {
        const real = window.Auth.getRealSession();
        if (!real) return;
        const btn = document.getElementById("btn-guardar-perfil");
        const nombre = document.getElementById("config-perfil-nombre").value.trim();
        const agrupacion = document.getElementById("config-perfil-agrupacion").value.trim();
        if (!nombre) { window._showToast?.("El nombre no puede quedar vacío", "error"); return; }
        btn.disabled = true; const txt = btn.textContent; btn.textContent = "Guardando...";
        try {
          await updateDoc(doc(db, "usuarios", real.uid), { nombre, agrupacion });
          real.nombre = nombre;
          sessionStorage.getItem("sistemaOrquestas_session") && sessionStorage.setItem("sistemaOrquestas_session", JSON.stringify(real));
          localStorage.getItem("sistemaOrquestas_session") && localStorage.setItem("sistemaOrquestas_session", JSON.stringify(real));
          window._showToast?.("Perfil actualizado", "success");
          window.UI.render();
        } catch (err) {
          window._showToast?.("No se pudo guardar: " + err.message, "error");
        } finally { btn.disabled = false; btn.textContent = txt; }
      });

      // ---- Modo de prueba (solo Owner Supremo real) ----
      document.getElementById("btn-aplicar-preview").addEventListener("click", () => {
        const rol = document.getElementById("config-preview-rol").value;
        const nucleo = document.getElementById("config-preview-nucleo").value;
        if (window.Auth.setPreviewOverride(rol, nucleo)) {
          window._showToast?.(`Viendo el sitio como ${rol}${nucleo ? " · " + nucleo : ""}`, "success");
          window.location.href = "panel.html";
        }
      });
      document.getElementById("btn-salir-preview").addEventListener("click", () => {
        window.Auth.clearPreviewOverride();
        window._showToast?.("Volviste a tu vista real (Owner Supremo)", "success");
        window.location.href = "panel.html";
      });
    }

    gearBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
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
      document.getElementById("config-perfil-nombre").value = data.nombre || real.nombre || "";
      document.getElementById("config-perfil-agrupacion").value = data.agrupacion || "";
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

// Inicialización directa (módulo ES)
window.UI.render();
