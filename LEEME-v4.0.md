# Sistema de Orquestas · v4.0 (la "2.0") — Léeme

Este paquete implementa el plan `PLAN-2.0-Sistema-Orquestas.md`. Aquí está **qué quedó hecho, qué falta, cómo publicarlo y qué se probó realmente**.

## 1. Estado de tus 20 puntos

| # | Punto | Estado | Nota |
|---|---|---|---|
| T1 | Rótulo del núcleo como texto con línea separadora | ✔ | Ícono pequeño + "Núcleo (Estado)" + línea vertical antes de los botones |
| T2 | El rótulo muestra el núcleo real de la base de datos | ✔ | Sale del "núcleo activo"; además el perfil se relee de Firestore en cada carga |
| T3 | "← Volver" más arriba y a la izquierda | ✔ | Misma barra, mismo lugar, en todas las páginas |
| T4 | Piezas: guardar bien, descargar como PDF | ✔ / ⚠ | Código listo. **Depende de que tu Cloudinary entregue PDF** (ver 3.6) |
| T5 | Eliminar, renombrar y cambiar piezas e instrumentos (boceto) | ✔ | Menú "···" por pieza e instrumento; "Descargar todo" por pieza y por agrupación (ZIP) |
| T6 | Quitar la edición de citas, sin rastro | ✔ | Código, modal, botón, estilos y regla `/contenido` eliminados. Ver 3.7 |
| T7 | Quitar "Exportar CSV" | ✔ | Estaba solo en Miembros |
| T8 | Calendario 2.0 por rol y cuenta | ✔ | Ver 3.2: **hay que publicar las reglas** |
| T9 | PDF de Formación se ven como PDF | ✔ / ⚠ | Visor propio (PDF.js). Mismo aviso que T4 |
| T10 | Editar niveles con una sola tuerca | ✔ | Renombrar, ordenar (▲▼), agregar, eliminar. Si un nivel tiene recursos, eliminarlo **elimina también sus recursos** (con confirmación); no hay opción "mover" |
| T11 | Ficha de miembro limpia ("Desde", sin rol/ubicación/temporal) | ✔ | |
| T12 | Instrumento asociado a cada usuario | ✔ | Catálogo editable en `instrumentos.js`; se resalta en Repertorio |
| T13 | No pedir núcleo y estado otra vez | ✔ | Se hereda del núcleo activo (solo el Director regional pide estado) |
| T14 | Contraseña en blanco con texto negro | ✔ | Con botón Copiar; se muestra una sola vez |
| T15 | Miembros sin "quiz" | ✔ | Una pantalla con filtros + panel lateral |
| T16 | Editar sin salir del documento; sin "Nuevo" verde | ✔ | |
| T17 | Lupa solo sobre la imagen, zoom animado | ✔ | |
| T18 | Recordar el último núcleo entre páginas | ✔ | |
| T19 | El rótulo cambia y se adapta al largo | ✔ | |
| T20 | Núcleos abajo a la derecha, sin "acceso rápido" | ✔ | Interpretación: quité el selector + botón "Núcleos" repetidos. Las tarjetas Piezas/Formación/Miembros se quedan |

Además: S1 (XSS del calendario), reglas de Firestore, contraseñas generadas en el servidor, desactivación real de cuentas, IA filtrada por núcleo/rol, regla de color rojo/negro corregida en todo el sitio, tuteo unificado.

## 2. Lo que NO está todavía (del plan)

- **B1 · IDs de núcleo:** los núcleos siguen identificándose por nombre. Con dos "Libertador" (Táchira y Cojedes) ya aparecen por separado en el panel, pero **sus datos siguen mezclados** (miembros, eventos…). Requiere migración: espero tu decisión (#4 del plan).
- **S12 · Subida de archivos autorizada por el backend** y cambio de almacenamiento (espero el resultado de la prueba de §3.6).
- **S13** CSP/SRI · **S14** App Check y restricción de la clave de Firebase (se hace en la consola) · **S16** registro de auditoría.
- Ideas visuales: barra lateral de íconos (I1), búsqueda global ⌘K (I4), cuadrícula tipo mampostería (I6), ilustraciones (I14/I33), PWA (I32), avisos (I34).
- Animaciones: transiciones entre páginas (A1), entrada escalonada (A2), cambio de mes deslizante (A7), flyers arrastrables (A9), barra de progreso del carrusel (A10), entrada tipográfica (A18), reordenar niveles arrastrando (A19; hoy se usan flechas ▲▼).
- Eliminar una pieza/recurso **no borra el archivo** de Cloudinary (quedan huérfanos hasta tener el endpoint de S12).
- Las piezas antiguas que apuntaban a la agrupación **por nombre** no aparecerán (las nuevas apuntan por ID). Según tus capturas había 0 piezas, así que no debería afectarte.

## 3. Cómo publicarlo (en este orden)

1. **Respaldo:** exporta Firestore antes de tocar nada.
2. **API (Vercel):** sube `sistema-cma-api-v4.0` y define `ALLOWED_ORIGIN` con el/los dominio(s) del sitio separados por coma (ej. `https://tu-usuario.github.io`). Las demás variables (`FIREBASE_SERVICE_ACCOUNT_KEY`, claves de IA) ya existen.
3. **Reglas:** Firebase Console → Firestore → Reglas → pega `firestore.rules` → Publicar. **Pruébalas en el "Simulador de reglas"** (no pude ejecutarlas contra el emulador). Casos mínimos: estudiante lee evento solo de profesores (debe fallar); admin de otro núcleo escribe un flyer (debe fallar); director nacional borra un Owner (debe fallar).
4. **Front:** sube esta carpeta a GitHub Pages.
5. **Primer arranque:** entra con una cuenta de director/admin y abre el Panel una vez. Eso convierte automáticamente los eventos viejos (`groups`) al formato nuevo (`audiencia`) y registra los niveles de Formación existentes. Hasta entonces, profesores y estudiantes no verán los eventos antiguos.
6. **Prueba de PDF (1 minuto):** abre en una pestaña nueva la URL de un PDF ya subido. Si da error 401/bloqueado, en Cloudinary → Settings → Security activa **"Allow delivery of PDF and ZIP files"**. Si prefieres cambiar de almacenamiento, ver Plan §7.4. Todo el acceso a archivos pasa por `almacen.js`.
7. **Citas de la portada:** ahora son tres tarjetas fijas en `index.html` (con el texto original del sistema). Si habías editado las citas desde el sitio, copia ese texto al HTML.
8. Borra de Firestore el documento `contenido/citas` (ya no se usa).

## 4. Qué se probó y cómo (con honestidad)

- **Backend:** 20 pruebas automáticas con Firebase Admin simulado (`api/pruebas/test-api.js`): jerarquías, validaciones, rollback, desactivación, CORS, claves.
- **Front:** pruebas automáticas en Chromium con **Firebase simulado en memoria** (`pruebas/`): 7 roles, calendario, núcleo activo, agrupaciones, piezas con PDF (subida simulada), visor, descargas/ZIP, miembros, formación, zoom, regla de color, XSS, y cabecera en 1440/1024/390 px. Todas pasan.
- **No probado:** reglas contra el emulador oficial; Firebase y Cloudinary reales; modo oscuro de las pantallas nuevas; dispositivos reales; lectores de pantalla. Hazles una pasada con cuentas reales de cada rol (matriz en Plan §14.1) antes de usarlo con el núcleo.
