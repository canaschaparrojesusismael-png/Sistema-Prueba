// Catálogo de instrumentos (v4.0). Se usa en Miembros (instrumento de cada persona),
// en Repertorio (a qué instrumento corresponde cada partitura) y en filtros.
// Para agregar uno, súmalo a su grupo. "Otro…" permite escribir uno que no esté.
export const GRUPOS_INSTRUMENTOS = [
  { grupo: "Cuerdas", items: ["Violín", "Viola", "Violonchelo", "Contrabajo", "Arpa", "Guitarra", "Cuatro"] },
  { grupo: "Maderas", items: ["Flauta", "Oboe", "Clarinete", "Fagot", "Saxofón"] },
  { grupo: "Metales", items: ["Corno", "Trompeta", "Trombón", "Tuba"] },
  { grupo: "Percusión y teclados", items: ["Percusión", "Timbales", "Piano"] },
  { grupo: "Voces", items: ["Voz (Soprano)", "Voz (Contralto)", "Voz (Tenor)", "Voz (Bajo)"] },
];
export const TODOS_LOS_INSTRUMENTOS = GRUPOS_INSTRUMENTOS.flatMap((g) => g.items);

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// <option>s agrupadas. Si el valor actual no está en el catálogo se conserva como opción propia.
export function opcionesInstrumentoHTML(seleccionado = "", { vacio = "Sin instrumento" } = {}) {
  const enCatalogo = !seleccionado || TODOS_LOS_INSTRUMENTOS.includes(seleccionado);
  return `<option value="">${esc(vacio)}</option>` +
    GRUPOS_INSTRUMENTOS.map((g) => `<optgroup label="${esc(g.grupo)}">${g.items.map((i) => `<option value="${esc(i)}" ${i === seleccionado ? "selected" : ""}>${esc(i)}</option>`).join("")}</optgroup>`).join("") +
    (enCatalogo ? "" : `<option value="${esc(seleccionado)}" selected>${esc(seleccionado)}</option>`) +
    `<option value="__otro__">Otro…</option>`;
}

// Enlaza un <select> hecho con opcionesInstrumentoHTML: al elegir "Otro…" pide el nombre.
export function enlazarSelectInstrumento(select) {
  let anterior = select.value;
  select.addEventListener("change", async () => {
    if (select.value !== "__otro__") { anterior = select.value; return; }
    const nombre = await window._promptDialog("Escribe el nombre del instrumento:", "", { titulo: "Otro instrumento", placeholder: "Ej. Mandolina" });
    const limpio = (nombre || "").trim().slice(0, 60);
    if (!limpio) { select.value = anterior; return; }
    if (![...select.options].some((o) => o.value === limpio)) {
      const op = document.createElement("option"); op.value = limpio; op.textContent = limpio;
      select.insertBefore(op, select.querySelector('option[value="__otro__"]'));
    }
    select.value = limpio; anterior = limpio;
  });
}
