# Changelog — Frontend (Sistema de Orquestas)

> v3.0 (P-61): antes el historial de decisiones vivía disperso en comentarios
> dentro del código (muy bien escritos, pero sin un lugar central). Este
> archivo junta un resumen por versión. Los códigos entre paréntesis (G-XX,
> P-XX) referencian el ítem correspondiente del plan maestro v3.0.
>
> **Para la próxima versión:** al editar `estilos.css` o cualquier `.js`
> compartido, subí el número de `?v=` en TODOS los archivos que lo
> referencian (hoy es `12.0` en todos, ver comentario al principio de
> `estilos.css`).

## v4.0 — Versión 2.0: seguridad, núcleo activo, piezas/PDF y rediseño (2026-10)

Ver `LEEME-v4.0.md` (estado de cada punto del plan) y `PLAN-2.0-Sistema-Orquestas.md`.

### Seguridad
- **S1 (crítico):** el calendario escapaba mal título/foto/color de los eventos (XSS almacenado). Ahora todo se escapa, el color solo admite `#rrggbb` y la foto solo `https://`.
- `firestore.rules` reescritas: usuarios legibles solo por alcance; alta/baja de usuarios solo desde el backend; lista blanca de campos editables; ningún director nacional puede tocar a un Owner; escritura de flyers/eventos/agrupaciones/piezas/partituras solo en el núcleo propio; **eventos con audiencia verificada en el servidor**; una cuenta desactivada no accede a nada.
- Las contraseñas ya no se generan en el navegador (`Math.random`): las genera el servidor y se muestran una sola vez.
- "Desactivar" ahora deshabilita la cuenta en Authentication y revoca sus sesiones.
- Estadísticas de "conectados" limitadas al alcance de cada rol.

### Estructura y diseño
- Nuevo `nucleo-activo.js`: un único núcleo activo, **recordado entre páginas y sesiones**; rótulo de cabecera como texto con línea separadora, que cambia al cambiar de núcleo y se adapta al largo; botón flotante rojo abajo a la derecha con panel de núcleos (crear / renombrar / eliminar), en todas las páginas. Sincronización del perfil real en cada carga.
- Barra "← Volver" bajo la cabecera, en el mismo lugar en todas las páginas.
- Regla de color corregida en todo el sitio: **rojo = importante (`.btn-submit`), negro = secundario (`.btn-cerrar`)** (estaban invertidos). Reset global de fuente.
- Componentes nuevos: `ui-componentes.js` (panel lateral, menú "···", borrado con "Deshacer"), `visor-pdf.js` (PDF.js), `almacen.js` (subida/descarga de PDF y ZIP), `instrumentos.js`, `agrupaciones.js`, `recursos-form.js`.
- Animaciones: sin rebotes ni `transition: all`; zoom de flyers con animación desde la miniatura; carrusel de portada sin autoplay con "reducir movimiento" ni en pestañas ocultas.

### Pantallas
- **Panel:** calendario 2.0 (visibilidad por rol/agrupación desde la cuenta real, agrupaciones en tiempo real, próximos eventos, una sola salida por ventana).
- **Piezas / Repertorio:** crear, renombrar y eliminar agrupaciones, piezas e instrumentos; PDF como PDF; visor propio; descargar uno, todo (ZIP) o "mis partituras"; instrumento destacado; portada = primera página del PDF; "Deshacer".
- **Miembros:** una sola pantalla con filtros (sin recorrido de preguntas); panel lateral para crear/editar sin pedir estado/núcleo; instrumento; "Desde: d/m/aaaa"; contraseña en caja blanca con texto negro; sin rol repetido, sin "temporal", sin CSV.
- **Formación:** niveles administrables con **una sola tuerca**; editar sin salir del documento; visor de PDF propio; sin la insignia "Nuevo".
- **Portada:** citas fijas, sin edición (código, modal, estilos y regla eliminados).
- Microcopy unificado a "tú". Se eliminó `agrupacion-detalle.html` (código muerto).

## v3.0 — Rework de interfaz y experiencia (2026-09)

### Fundación / transversal
- Diálogos propios (`_confirmDialog`, `_alertDialog`, `_promptDialog` en `auth.js`) reemplazando `alert()`/`confirm()`/`prompt()` nativos en todo el sitio (G-02).
- Sistema de toasts apilable, ya no se superponen si aparece más de uno seguido (G-03).
- **Corregido:** el modo oscuro no persistía al cambiar de página — ahora se aplica desde el `<head>` de cada página antes del primer render (G-04).
- Nuevos tokens de color `--color-borde` / `--color-superficie-suave` para que el modo oscuro cubra bordes y fondos que antes quedaban fijos en claro (G-04).
- Favicon e ícono propio (morado, nota musical) + etiquetas Open Graph en todas las páginas (G-05, G-06).
- Cache-busting unificado: un solo `?v=12.0` en vez de versiones desincronizadas entre archivos (G-35/P-01).
- `prefers-reduced-motion`, foco de teclado visible, hoja de estilos de impresión.
- **Eliminado:** `images.jpg` (escudo del colegio, huérfano desde que se sacó del estado de carga del carrusel) (P-02).
- **Reemplazado:** `agrupacion-detalle.html` (prototipo viejo con datos falsos hardcodeados, sin enlazar desde ningún menú) ahora redirige a `repertorio.html` (G-30).

### Inicio / Carrusel
- Citas de la portada ahora editables desde Firestore (antes texto fijo "— Cita 1/2/3") (G-07).
- Puntos de posición, swipe táctil, navegación por teclado, pausa al pasar el mouse/foco, precarga de la siguiente imagen, contador de posición (G-08, G-09, G-10, P-06, P-11, P-12).

### Header / Configuración
- Menú "hamburguesa" en pantallas angostas (G-11); color de avatar derivado del rol en toda la app (G-12).
- Configuración reorganizada en pestañas: Perfil, Apariencia, Notificaciones, Cuenta (G-13, G-14).
- Copiar correo/UID, última sesión anterior, confirmación antes de aplicar el modo de prueba (P-21, P-22, P-24).

### Panel (Flyers y Calendario)
- Flyers clicables (lightbox a pantalla completa) + vínculo opcional a un evento del calendario (G-15, G-16).
- Selector rápido de mes/año + botón "Hoy" en el calendario (G-17).
- Día de hoy resaltado, "+N más" cuando hay muchos eventos el mismo día (P-25, P-28).

### Formación
- Buscador por nombre/tipo/descripción dentro del nivel activo (G-21).
- Autor y fecha visibles en cada tarjeta de recurso (G-23).
- Página secundaria `recurso-detalle.html`: visor de PDF embebido, info completa, recursos relacionados del mismo nivel (G-19, G-20).
- Contador de recursos por nivel, badge "Nuevo", confirmación antes de reemplazar un PDF ya cargado (P-32, P-35, P-37).

### Tutor Musical (IA)
- El motor de IA (`proveedoresIA.js` en el backend) no se tocó — ver `CHANGELOG.md` del backend para el detalle de qué se amplió ahí.
- Chat: botón "Ir a Formación/Piezas/Calendario" bajo respuestas que citan el sitio, chips de preguntas sugeridas, indicador de carga con los mismos puntitos del resto del sitio, contador de caracteres, descarga de conversación bajo demanda (G-26, G-27, P-38, P-39, P-41).

### Miembros
- Buscador por nombre/correo, exportar CSV (G-28, P-44).
- **Corregido:** crear un usuario ahora muestra la contraseña temporal en el mismo modal con "Copiar" que ya usaba "Restablecer contraseña" (antes era un toast que se borraba solo a los 3.5s) (G-29).
- Badge de contraseña temporal sin usar, fecha de alta visible (P-43, P-46).

### Piezas / Repertorio
- Subida a Cloudinary consolidada en el módulo compartido `gestor-imagenes.js` (antes `repertorio.html` tenía su propia copia) (G-31).
- Buscador dentro de una agrupación, instrumentos ordenados alfabéticamente, fecha de última actualización de cada partitura, confirmación antes de reemplazar (G-32, P-49, P-50, P-51).
- Cantidad de piezas visible en la tarjeta de cada agrupación (P-53).

### Login
- Panel izquierdo con el ícono del sitio (antes solo texto) (G-33).
- Autofoco en el correo, tooltip explicando "Recordarme", indicador de carga consistente con el resto del sitio (P-55, P-56, P-57).

## v3.1 — Correcciones tras feedback sobre v3.0 (2026-09)

> v3.0 metió varias cosas que no se habían pedido y rompió otras que sí
> andaban. Esta versión **no agrega funciones nuevas**: corrige regresiones
> puntuales reportadas, saca lo que se pidió sacar, y deja todo lo demás de
> v3.0 tal cual estaba (diálogos propios, toasts, modo oscuro, buscador de
> Formación, visor de PDF, chat de IA, etc. — ninguno de esos se tocó).

- **Corregido:** el editor del carrusel (⚙️) quedaba con la galería vacía
  para siempre si se abría antes de que Firestore devolviera la primera
  respuesta — el carrusel público sí se actualizaba, pero el editor no.
  Ahora, si se abre antes de tiempo, muestra el mismo indicador de carga
  del resto del sitio y se completa solo apenas llegan los datos.
- **Corregido:** el menú de la cuenta (avatar, arriba a la derecha) abría y
  cerraba también con hover del mouse, lo que en ciertas resoluciones podía
  cerrar el menú justo al mover el mouse hacia "Configuración" y volver
  casi imposible de abrir. Ahora es solo click/touch (igual en escritorio,
  tablet y celular), se cierra con click afuera o con Escape, y al abrir
  Configuración el menú se cierra explícitamente en vez de quedar tapado
  atrás.
- **Eliminado:** el vínculo directo a "Repertorio" en el menú del Panel.
  No era una sección aparte — es la pantalla de detalle de una agrupación,
  a la que ya se llega desde Piezas → (agrupación). Puesta como link suelto
  no mostraba nada útil.
- **Eliminado:** el vínculo opcional entre un flyer y un evento del
  calendario (G-16 de v3.0) — selector en el editor, botón "Ver evento" en
  el lightbox, y el campo `eventoId` al guardar. Se descarta por pedido
  explícito.
- **Corregido:** el buscador de Formación (G-21 de v3.0) solo filtraba
  dentro del nivel/pestaña activa — si el recurso buscado estaba en otro
  nivel, no aparecía nada y parecía no funcionar. Ahora, en cuanto hay
  texto escrito, busca en todos los niveles a la vez y cada resultado
  muestra de qué nivel es.
- **Corregido:** a los puntitos de carga les faltaba el movimiento vertical
  ("un poco de arriba hacia abajo") — antes solo cambiaban de color y
  escala. Se sumó al mismo `@keyframes` que ya tenían, sin tocar su
  velocidad ni su secuencia.
- **Eliminado:** la barra flotante fija en pantalla con nombre / rol /
  núcleo / "Online" que aparecía en todas las páginas. Mostraba exactamente
  los mismos datos que ya están un click más allá, en el menú de la cuenta
  — quedaba duplicada y era la fuente más probable de "el sitio siempre
  dice mi rango". Ese dato sigue disponible en el menú, solo que ya no se
  empuja a la vista todo el tiempo sin pedirlo.
- **Reemplazado:** el favicon/ícono genérico (nota musical morada) por el
  logo real de "El Sistema" en favicon, ícono de la pestaña, ícono de PWA
  (`icon-512.png`) y el panel del login (ahora a un tamaño donde se lee el
  texto, antes 72px).
- Cache-busting subido de `?v=12.0` a `?v=13.0` en todos los archivos, para
  que el navegador no siga sirviendo versiones viejas de `estilos.css` /
  `main.js` / `ui-manager.js` desde caché.

## v3.2 — Segunda ronda de correcciones (2026-09)

- **Eliminado:** el buscador de Formación (agregado y corregido en v3.0/v3.1)
  se sacó por completo, por pedido explícito — vuelve a navegarse solo por
  pestañas de nivel.
- **Eliminado:** el aviso dentro de Configuración → Perfil que decía "para
  cambiar tu nombre o agrupación, pedile a un director/admin que lo haga
  desde Miembros".
- **Eliminado:** la pestaña "Notificaciones" de Configuración — todos sus
  switches estaban deshabilitados (stub sin función real), tal como se
  armó en v3.0 (G-14).
- **Corregido:** subir un PDF pesado (por ejemplo, una partitura escaneada
  en Piezas → Repertorio, o un recurso en Formación) fallaba con el error
  técnico crudo de Cloudinary ("File size too large. Got 11980848. Maximum
  is 10485760.") — confuso si no se sabe qué es Cloudinary. Ahora
  `gestor-imagenes.js` (el módulo compartido de subida, usado por Carrusel,
  Flyers, Piezas y Formación) avisa ANTES de intentar subir, en español y en
  MB, tanto si el archivo ya se ve pesado del lado del navegador como si
  Cloudinary igual lo rechaza. El límite real (10 MB) es una configuración
  del preset de Cloudinary, no del código — si se necesita subir ese techo,
  hay que hacerlo desde el panel de Cloudinary (preset `orquestas_unsigned`)
  y actualizar `TAMANO_MAXIMO_MB` en `gestor-imagenes.js` para que coincida.
- Cache-busting subido de `?v=13.0` a `?v=14.0`.

Cambios de comportamiento del Tutor Musical (IA) — ver `CHANGELOG.md` del
backend.

## v3.3 — El sitio se veía "plano y viejo": encontrado el motivo real (2026-09)

> Se pidió rehacer visualmente todo el sitio para que estuviera al nivel de
> Configuración, con foco especial en el Calendario. Antes de rediseñar
> nada, se revisó por qué Configuración se veía distinto al resto — y
> apareció un bug concreto que explica gran parte de la diferencia.

- **Corregido (el hallazgo grande):** `--color-borde` y
  `--color-superficie-suave`, las dos variables CSS que dan borde y fondo
  suave a casi todo el sitio, estaban definidas como **referencia a sí
  mismas** dentro de `:root` (`--color-borde: var(--color-borde);`), lo
  cual CSS trata como inválido. En modo oscuro sí tenían un valor real
  (redefinido más abajo), pero en modo **claro — el que ve todo el mundo
  por defecto** — nunca lo tuvieron. Resultado: las celdas del calendario,
  los separadores de tarjetas de Miembros, los inputs del login, y
  tarjetas de Piezas/Formación/Repertorio se veían **sin borde ni fondo**
  en modo claro, aunque el CSS que los pinta estuviera bien escrito y
  nunca se hubiera tocado. Configuración nunca usó estas dos variables
  (tiene sus bordes puestos a mano en rgba), por eso era la única sección
  que se veía "terminada". Con las dos variables corregidas a valores
  reales, todo lo que ya dependía de ellas en el CSS y el HTML — sin tocar
  ese CSS/HTML — empieza a mostrar su borde y su fondo correctamente.
- **Tipografía:** se reemplazó `'Segoe UI', system-ui...` (la fuente por
  defecto de Windows, sin identidad propia y distinta en cada sistema
  operativo) por **Lexend**, una tipografía diseñada específicamente para
  mejorar la fluidez de lectura — una elección con sentido para un sitio
  que usan estudiantes, profesores y directores de edades muy distintas.
  Se carga una sola vez desde Google Fonts en `estilos.css`, así que
  alcanza con este cambio para que se vea en las 9 páginas.
- **Calendario** (además de heredar la corrección de bordes/fondos de
  arriba):
  - Los botones de mes anterior/siguiente eran negros lisos (`#0a0a0a`),
    sin relación con el morado del resto del sitio — ahora usan
    `--color-primario`.
  - Las celdas de los días y el encabezado de la semana tenían esquinas
    casi rectas (4px) mientras el resto del sitio usa esquinas bien
    redondeadas (10–16px) — se subieron a 8px para que no se sientan de
    otra época.
  - "Otro mes" (los días grises de meses vecinos) usaba un gris fijo que
    no respetaba modo oscuro — ahora usa el color de texto tenue del
    sistema de diseño.

**Por transparencia:** no tengo forma de tomar capturas de pantalla desde
acá para verificar el resultado final pixel por pixel — los cambios de
arriba están razonados y verificados a nivel de código (balance de
llaves, sintaxis), pero la validación visual real depende de que lo veas
en el sitio. Rehacer el layout/estructura de cada página desde cero (más
allá de estos ajustes) es un trabajo más grande — si después de ver esto
seguís viendo algo específico feo o mal distribuido en una pantalla
puntual, decime cuál y lo encaro directamente ahí.

## v3.4 — Corrección a partir de capturas reales del sitio (2026-09)

> Se recibieron 13 capturas de pantalla del sitio en uso real (incluyendo
> modo oscuro), que permitieron encontrar bugs concretos en vez de adivinar
> sobre gustos. Como se pidió explícitamente: nada de esto agrega
> funciones nuevas, todo es corrección de algo que ya estaba.

- **Corregido — contraste en modo oscuro (el bug más visible de las
  capturas):** el título del carrusel ("Sin título"), el pie de página, la
  marca del gobierno en el header y el texto de las tarjetas de citas
  usaban `var(--color-blanco)` para su color de texto. Pero
  `--color-blanco` cambia a azul marino oscuro en modo oscuro (para servir
  de fondo de tarjeta en otros componentes) — y estos 5 textos van sobre
  un degradado morado que NO cambia entre modos. Resultado: texto azul
  oscuro sobre fondo morado oscuro, casi ilegible, tal como se veía en la
  captura del inicio en modo oscuro. Se creó `--color-texto-sobre-primario`
  (siempre blanco, sin importar el modo) y se aplicó en los 5 lugares.
- **Corregido — el calendario "se veía muy a la izquierda":** la sección
  de flyers arriba del calendario usa un contenedor centrado de 1200px,
  pero el calendario reutilizaba `.contenido-web.container` (compartida
  con index.html) de 1050px — dos anchos centrados distintos, apilados en
  la misma página, cuyos bordes izquierdo/derecho no coinciden. Se igualó
  a 1200px solo dentro de Panel; index.html sigue en 1050px, sin tocarse.
- **Corregido — los botones Piezas/Formación/Miembros se veían como tiras
  de texto perdidas** al lado de un calendario mucho más alto: se les
  agregó ícono y más padding para que tengan más presencia visual (sin
  estirarlos a cajas gigantes vacías, que es justamente el problema que
  ya se había evitado antes).
- **Corregido — los flyers no tenían pantalla de carga como el carrusel:**
  confirmado. Se aplicó el mismo arreglo que ya tenía el carrusel: (a) la
  vista pública de flyers ahora distingue "todavía cargando" de "este
  núcleo no tiene flyers" (antes mostraba el segundo mensaje mientras
  pasaba lo primero); (b) el editor de flyers, si se abre antes de que
  Firestore conteste la primera vez, ya no se queda pegado en vacío para
  siempre — espera y se completa solo.
- **Eliminado:** el botón de descargar (ícono ⬇) en el header del chat
  Tutor Musical, por pedido explícito. Aclaración: no descargaba "la IA",
  descargaba un .txt con la conversación visible en pantalla (100% local,
  no mandaba nada a ningún lado) — se sacó igual porque así se pidió.
- **Mejorado:** el botón ⚙/✏️ para configurar carrusel, flyers y
  calendario ya tenía una animación de giro al pasar el mouse (90°, antes
  de este cambio) — se hizo más notoria (180° con un rebote suave) y
  ahora también se activa con click/touch, no solo con mouse encima, para
  que se vea igual en celular.
- **Sobre "los puntitos de carga nunca cambian de color":** revisado a
  fondo — el CSS que los anima (cambia de color Y ahora también sube/baja
  un poco, agregado en v3.3) está bien y no tiene ninguna otra regla que
  lo pise en ningún archivo. La sospecha más probable es que la versión
  que se vio en las capturas quedó en caché desde antes de v3.1 — convendría
  probar con recarga forzada (Ctrl+Shift+R / Cmd+Shift+R) después de
  desplegar este zip para descartarlo del todo.

## v3.5 — El bug grande: media app entera de botones sin estilo (2026-09)

- **Corregido — EL BUG MÁS GRANDE ENCONTRADO HASTA AHORA:** `.btn`,
  `.btn-submit` y `.btn-cerrar` solo tenían estilo definido dentro de
  `.modal-content ...` (es decir, únicamente para botones DENTRO de un
  modal). Pero estas mismas clases se usan en ~30 botones que están en la
  página, no en un modal: "+ Nuevo Registro" y "Exportar CSV" en Miembros,
  "+ Nueva pieza" en Repertorio, entre otros. Todos esos botones se veían
  con el estilo crudo del navegador (gris, sin bordes redondeados, sin
  sombra) — exactamente lo que se veía en las capturas que mandaste. Se
  generalizaron las reglas para que apliquen en cualquier parte del sitio,
  estén o no dentro de un modal.
- **Corregido — "← Volver" se veía centrado:** en Miembros, Piezas,
  Formación, Repertorio y el detalle de un recurso, el link para volver
  atrás quedaba centrado horizontalmente en vez de pegado a la izquierda
  como el resto del contenido de la página. Se le puso alineación
  explícita en los 5 archivos, para que no dependa de cómo se comporte el
  contenedor flex que lo rodea.
- **Corregido — los puntitos de posición del carrusel** (los que muestran
  en qué imagen de 14 estás, abajo del carrusel) **solo se veían en modo
  oscuro:** usaban un blanco translúcido fijo, que se pierde contra el
  fondo casi blanco del modo claro. Ahora usan los mismos colores del
  sistema de diseño que ya funcionan en los dos modos, con una transición
  más suave y una reacción al pasar el mouse (antes no tenían ninguna).
- **Ajustado — el giro del botón ⚙️/✏️ para configurar carrusel/flyers/
  calendario:** se había hecho más notorio en la ronda anterior (90° →
  180°), pero el pedido explícito fue lo contrario: un giro chico (12°,
  antes 90-180°) con una curva de easing más lenta, para que se sienta
  como una animación real y no como un salto brusco.
- **Corregido — un flyer con una URL de imagen rota mostraba el ícono
  nativo del navegador ("imagen rota") en vez de algo prolijo:** el manejo
  de error solo escondía el esqueleto de carga sin reemplazar la imagen
  rota. Ahora, si una imagen falla, se oculta el `<img>` roto y el
  esqueleto pasa a mostrar un ícono + "No se pudo cargar" en su lugar.

**Nota sobre el giro del botón:** si en tu prueba anterior viste 90° "de
golpe" en vez de la versión más suave que se había mandado, es una señal
más de que el navegador puede estar sirviendo una versión vieja desde
caché — conviene recargar forzado (Ctrl+Shift+R / Cmd+Shift+R) después de
subir este zip antes de evaluar si algo sigue mal.

## v3.6 — Fundidos reales + botones con degradé en todo el sitio (2026-09)

- **Corregido — dirección de los puntitos de carga:** iban de izquierda a
  derecha (el punto 1 se oscurecía primero); pedido explícito era de
  derecha a izquierda. Se invirtieron los `animation-delay`.
- **Corregido — "las imágenes aparecen de la nada" (carrusel Y flyers):**
  encontrado el motivo real. El fundido de entrada estaba enganchado a que
  la etiqueta `<img>` TUVIERA un atributo `src` (que pasa apenas se asigna
  la URL, antes de que se descargue un solo byte), no a que la imagen
  hubiera terminado de cargar de verdad. En la práctica la opacidad ya
  estaba en 1 cuando todavía no había nada dibujado, así que la imagen
  "aparecía de golpe" en cuanto terminaba de bajar. Ahora el fundido se
  dispara con el evento `load` real de la imagen — carrusel principal y
  cada flyer.
- **Botones "aburridos":** `.btn-submit`/`.btn-cerrar` (usados en ~30
  botones de toda la web) eran un relleno sólido liso, sin relación visual
  con los botones del header (`.btn-nav`), que sí tienen degradé + sombra +
  elevación al pasar el mouse. Se les llevó ese mismo lenguaje: degradé,
  sombra de color, elevación al pasar el mouse, y un achique al hacer
  click (feedback táctil que no existía en ningún botón antes). Mismo
  tratamiento para `.btn-config-mini` (botones chicos como "Núcleos"),
  las flechas de flyers (antes cuadradas negras lisas, esquinas de 5px) y
  las flechas del calendario (antes moradas lisas).

## v3.7 — Dirección corregida + timing de los fundidos + selector de núcleo (2026-09)

- **Corregido — dirección de los puntitos de carga (otra vez):** la
  descripción exacta que se dio esta vez ("el de la izquierda se oscurece
  primero, después se aclara MIENTRAS el segundo se oscurece") es de
  izquierda a derecha — la v3.6 lo había dejado al revés por una lectura
  ambigua de un mensaje anterior. Revertido.
- **Corregido — un motivo real por el que el fundido de las imágenes podía
  no verse:** si el navegador ya tenía la imagen en caché, el evento
  `load` puede disparar tan rápido que el `opacity:0` inicial nunca llega
  a pintarse en pantalla — el navegador junta los dos cambios en un solo
  frame y el fundido no se nota (se siente como si "apareciera de la
  nada", aunque el CSS esté bien). Se agregó un doble
  `requestAnimationFrame` (una técnica estándar para este problema
  puntual) que fuerza a que haya como mínimo un frame pintado en el medio,
  tanto en el carrusel como en cada flyer.
- **Corregido — el selector de núcleo** (el desplegable "Puente Real
  (Táchira)" arriba a la derecha, en el panel): no tenía NINGÚN estilo
  propio — era el `<select>` en blanco y negro por defecto del navegador,
  y por eso resaltaba como un elemento suelto sobre el header morado.
  Ahora es una píldora traslúcida ("vidrio esmerilado") acorde al resto
  del header, con su propio hover.
- **Animación agregada a los botones "⚙️ Núcleos"** (Panel y Piezas): el
  ícono de tuerca ahora gira un poco al pasar el mouse, igual que ya
  hacía el botón grande de editar carrusel/flyers/calendario — antes solo
  tenía la elevación del botón, sin nada en el ícono.

**Verificación honesta:** confirmé en el código que el giro del botón ⚙️
grande de calendario/flyers/carrusel (`.carousel-edit-btn`) SÍ está
presente y no tiene ningún override que lo anule — no encontré ningún bug
ahí. Si en tu prueba seguís sin verlo girar, lo más probable es una
versión vieja en caché del navegador, no un problema del código actual.
Para descartarlo del todo: abrí las herramientas de desarrollador (F12) →
pestaña Network → tildá "Disable cache" → recargá la página con eso
tildado, y fijate si `estilos.css?v=19.0` (este número) es lo que carga.

## v3.8 — Pasada de animaciones visibles en todo el sitio (2026-09)

> Las rondas anteriores fueron correcciones puntuales (bordes, botones,
> alineación) que son reales pero no se notan de un vistazo. Esta ronda
> es al revés: cambios pensados para que se noten apenas se entra al
> sitio, sin agregar secciones ni funciones nuevas — solo movimiento a
> cosas que ya estaban ahí quietas.

- **Los modales ya tenían una animación de entrada (`scaleIn`), pero era
  chica y rápida (0.9→1, 0.3s, sin rebote):** se hizo más notoria —
  ahora entra con un leve desplazamiento hacia arriba y un rebote suave
  (0.45s), en TODOS los modales del sitio (carrusel, flyers, citas,
  eventos, configuración, piezas, miembros) de una sola vez, porque todos
  comparten la misma clase `.modal-content`.
- **Entrada de página:** el contenido principal de cada página (compartido
  por las 9 páginas vía `.contenido-web.container`) ahora aparece con un
  fundido + deslizamiento hacia arriba al cargar, en vez de aparecer
  estático de golpe.
- **Entrada escalonada en las grillas de tarjetas:** en Formación,
  Miembros, Piezas y los botones del Panel (Piezas/Formación/Miembros),
  cada tarjeta aparece un poquito después que la anterior en vez de todas
  a la vez — efecto cascada.
- **Más feedback al interactuar:**
  - Tarjetas de recursos/agrupaciones/miembros: el hover ahora levanta más
    (antes 2px, ahora 6px) con sombra más marcada.
  - Días del calendario: además del cambio de color que ya tenían, ahora
    también crecen un poco al pasar el mouse y se achican al hacer click.
  - Botones "Piezas/Formación/Miembros" del Panel: el ícono se agranda un
    poco al pasar el mouse, separado del movimiento del botón.

## v3.9 — Editor del carrusel: de plano a con vida (2026-09)

- **Miniaturas del editor de carrusel:** antes eran cuadrados quietos, sin
  ninguna reacción al pasar el mouse, y la miniatura "seleccionada" solo
  se distinguía por un cambio de color de borde. Ahora se levantan y
  agrandan un poco al pasar el mouse, y la seleccionada tiene un
  resplandor (glow) alrededor además del borde.
- **Botón "+" para agregar imagen:** antes solo cambiaba de fondo al pasar
  el mouse. Ahora se levanta, agranda, y gira 90° — coherente con el
  mismo lenguaje de "girar" que ya tienen los demás íconos de engranaje
  del sitio.
- **Vista previa grande** (la imagen arriba del editor): se le agregó
  profundidad — un borde interno sutil más una sombra más marcada, en vez
  de quedar plana contra el fondo morado del modal.
- Se revisaron los campos de texto de TODOS los formularios del sitio
  (Miembros, Formación, Piezas, Eventos) para confirmar que están bien
  estilizados — lo están, ya tenían una regla que los cubre por su
  atributo `type`, no encontré ningún caso roto ahí.

## v3.9 — Rediseño visual del carrusel y flyers: formas y colores (2026-09)

- **Carrusel — nueva silueta:** las dos cajas (imagen y texto) tenían
  exactamente el mismo radio en las 4 esquinas — se veían como gemelas
  idénticas, solo cambiaba el contenido. Ahora cada una tiene un radio
  grande en dos esquinas opuestas y chico en las otras dos, en espejo
  entre sí (la de imagen y la de texto se "rimán" visualmente en vez de
  ser un calco).
- **Carrusel — profundidad real:** las sombras eran genéricas
  (`rgba(0,0,0,...)`, gris sin más). Ahora son sombras con tinte morado
  (`rgba(33,25,99,...)`), más grandes y más suaves — se sienten parte de
  la paleta en vez de una sombra de manual genérico.
- **Carrusel — textura:** la caja de texto tenía un degradé plano. Se le
  agregó un resplandor radial sutil arriba a la derecha (no rompe la
  paleta, solo le da un poco de variedad de luz).
- **Barrita roja bajo el título:** antes un rojo liso de 3px. Ahora un
  degradé rojo→naranja de 4px, con más peso visual.
- **Flechas del carrusel (‹ ›):** más grandes (44→46px), sombra con
  color, y un rebote real al pasar el mouse (antes solo un `scale`
  chiquito sin rebote).
- **Flyers:** mismo lenguaje de sombra con color + un `scale` sutil al
  pasar el mouse. Corregido de paso un bug real que esto mismo iba a
  introducir: el efecto "menú" (el flyer del medio un poco más abajo que
  los costados) estaba puesto con `style="transform:..."` en línea, que
  por especificidad de CSS le habría ganado siempre a cualquier `:hover`
  nuevo — se pasó a una variable CSS (`--corrimiento`) para que las dos
  cosas convivan.

## v2.x y anteriores
Ver comentarios `CORREGIDO`/`AGREGADO` fechados dentro de cada archivo — quedaron intactos, este changelog empieza a partir de v3.0.
