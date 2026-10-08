// ================================================================
// COMPONENTES COMPARTIDOS DE INTERFAZ — v4.0
//  · abrirPanel()        panel lateral (hoja inferior en celular) para crear / editar
//  · menuContextual()    menú "···" de cada tarjeta
//  · borrarConDeshacer() borra con aviso "Deshacer" de 8 s (en vez de confirmar todo)
// Reglas: una sola salida (la ×) + Esc + clic fuera; Guardar = rojo; Cancelar = negro.
// ================================================================
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export { esc };

let contadorPaneles = 0;
export function abrirPanel({ titulo = "", subtitulo = "", ancho = "normal", cuerpoHTML = "", pieHTML = "", onCerrar } = {}) {
  const id = `panel-lat-${++contadorPaneles}`;
  const previo = document.activeElement;
  const fondo = document.createElement("div");
  fondo.className = "panel-fondo";
  fondo.innerHTML = `
    <aside class="panel-lat panel-lat-${ancho}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <header class="panel-lat-cab">
        <div><h2 id="${id}-t">${esc(titulo)}</h2>${subtitulo ? `<p class="panel-lat-sub">${subtitulo}</p>` : ""}</div>
        <button type="button" class="panel-lat-x" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="panel-lat-cuerpo">${cuerpoHTML}</div>
      ${pieHTML !== null ? `<footer class="panel-lat-pie">${pieHTML}</footer>` : ""}
    </aside>`;
  document.body.appendChild(fondo);
  const panel = fondo.querySelector(".panel-lat");
  const api = { fondo, panel, cuerpo: panel.querySelector(".panel-lat-cuerpo"), pie: panel.querySelector(".panel-lat-pie"), cerrado: false };
  const bloqueoPrevio = document.body.style.overflow; document.body.style.overflow = "hidden";
  let cerrando = false;
  api.cerrar = () => {
    if (cerrando) return; cerrando = true; api.cerrado = true;
    document.removeEventListener("keydown", onKey, true);
    fondo.classList.remove("abierto");
    const fin = () => { fondo.remove(); document.body.style.overflow = bloqueoPrevio; try { previo?.focus?.(); } catch {} onCerrar?.(); };
    setTimeout(fin, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230);
  };
  const onKey = (e) => {
    if (e.key === "Escape" && !document.querySelector(".dialogo-overlay")) { e.stopPropagation(); api.cerrar(); }
    if (e.key === "Tab") {  // el foco se queda dentro del panel
      const f = [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter((x) => x.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  fondo.addEventListener("mousedown", (e) => { if (e.target === fondo) api.cerrar(); });
  panel.querySelector(".panel-lat-x").addEventListener("click", api.cerrar);
  requestAnimationFrame(() => requestAnimationFrame(() => { fondo.classList.add("abierto"); (panel.querySelector("[autofocus], input:not([type=hidden]), select, textarea") || panel.querySelector(".panel-lat-x")).focus({ preventScroll: true }); }));
  return api;
}

// items: [{ icono, texto, onClick, peligro }]
let menuAbierto = null;
export function cerrarMenuContextual() { menuAbierto?.(); menuAbierto = null; }
export function menuContextual(boton, items) {
  cerrarMenuContextual();
  const m = document.createElement("div");
  m.className = "menu-ctx"; m.setAttribute("role", "menu");
  m.innerHTML = items.map((it, i) => it.separador ? `<hr>` : `<button type="button" role="menuitem" data-i="${i}" class="${it.peligro ? "peligro" : ""}"><i class="fa-solid ${esc(it.icono || "fa-circle")}"></i><span>${esc(it.texto)}</span></button>`).join("");
  document.body.appendChild(m);
  const r = boton.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
  m.style.top = `${r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  requestAnimationFrame(() => m.classList.add("abierto"));
  const botones = [...m.querySelectorAll("button")]; botones[0]?.focus();
  const cerrar = () => { m.classList.remove("abierto"); setTimeout(() => m.remove(), 120); document.removeEventListener("click", fuera, true); document.removeEventListener("keydown", tecla, true); window.removeEventListener("scroll", cerrar, true); boton.setAttribute("aria-expanded", "false"); };
  const fuera = (e) => { if (!m.contains(e.target)) { cerrar(); if (boton.contains(e.target)) e.stopPropagation(); } };
  const tecla = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); cerrar(); boton.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const i = botones.indexOf(document.activeElement); botones[(i + (e.key === "ArrowDown" ? 1 : -1) + botones.length) % botones.length].focus(); }
  };
  m.addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; cerrar(); items[Number(b.dataset.i)].onClick?.(); });
  setTimeout(() => { document.addEventListener("click", fuera, true); document.addEventListener("keydown", tecla, true); window.addEventListener("scroll", cerrar, true); }, 0);
  boton.setAttribute("aria-expanded", "true");
  menuAbierto = cerrar;
  return cerrar;
}

// Quita algo de la pantalla YA, avisa con "Deshacer" y recién a los 8 s lo borra de verdad.
// aplicarUI(): oculta el elemento · revertirUI(): lo vuelve a mostrar · ejecutar(): borra en la base de datos.
export function borrarConDeshacer({ mensaje, aplicarUI, revertirUI, ejecutar, ms = 8000 }) {
  aplicarUI();
  let pendiente = true;
  const pila = document.getElementById("toast-stack") || (() => { const d = document.createElement("div"); d.id = "toast-stack"; document.body.appendChild(d); return d; })();
  const t = document.createElement("div");
  t.className = "toast toast-deshacer"; t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(mensaje)}</span><button type="button">Deshacer</button><i class="toast-barra" style="animation-duration:${ms}ms"></i>`;
  pila.appendChild(t);
  const quitar = () => { t.classList.add("saliendo"); setTimeout(() => t.remove(), 200); };
  const confirmar = async () => {
    if (!pendiente) return; pendiente = false; quitar();
    try { await ejecutar(); } catch (err) { revertirUI(); window._showToast?.("No se pudo eliminar: " + err.message, "error"); }
  };
  const temporizador = setTimeout(confirmar, ms);
  t.querySelector("button").addEventListener("click", () => { if (!pendiente) return; pendiente = false; clearTimeout(temporizador); revertirUI(); quitar(); });
  window.addEventListener("pagehide", () => { if (pendiente) { pendiente = false; clearTimeout(temporizador); ejecutar().catch(() => {}); } }, { once: true });
}
