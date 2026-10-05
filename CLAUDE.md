# MesaMía — Contexto del proyecto

Prototipo web de **planificador de menús semanales familiares**. Una familia sube los PDF/imágenes
del menú del cole o guardería de sus hijas (Aina e Iria) y la app propone comidas y cenas para los
7 días de la semana, equilibradas y sin repetir lo que ya comen en el colegio.

Estado actual: **la app funciona de verdad, de punta a punta**. El frontend (`app/planificador`,
`app/guardados`, `app/semana/[slug]`) llama al backend real (`server/` + `app/api/**`, ver sección
"Backend"), que llama de verdad a Gemini y Tavily. No hay ya ningún `setTimeout` simulando una
generación ni datos mock de una semana fija — se probó el circuito completo con claves reales:
subir/generar → sustituir un plato → confirmar y guardar → verlo en Guardados → abrir esa semana
guardada de solo lectura. Sigue siendo un prototipo de un único hogar sin autenticación ni base de
datos persistente de verdad — ver "Qué falta si esto pasa a producción" al final.

## Stack

| Pieza | Elección |
|---|---|
| Framework | Next.js 16.3.3, App Router |
| React | 19 |
| Lenguaje | TypeScript 5.7 (`strict: true`) |
| Estilos | Tailwind CSS v4 (vía `@tailwindcss/postcss`, sin `tailwind.config`) |
| Componentes | shadcn estilo `base-nova`, sobre **`@base-ui/react`** (no Radix) |
| Iconos | `lucide-react` |
| Analítica | `@vercel/analytics` (solo en producción) |
| Backend / IA | `@google/genai` (Gemini) + `@tavily/core` (búsqueda de recetas) + `zod` (esquemas/validación) — ver sección "Backend" |
| Gestor de paquetes | **pnpm** (`packageManager: pnpm@12.3.4`) |
| Origen | Generado con **v0.app** (ver `.gitignore` y `metadata.generator`) |

Scripts: `pnpm dev`, `pnpm build`, `pnpm start`. No hay tests, ni linter, ni CI configurados.

**El proyecto no es un repositorio git.** No hay `.git`, así que no hay historial ni ramas.

## Estructura

```
app/
  layout.tsx           Root layout. lang="es", metadata, favicon, Analytics en prod.
  planificador/
    page.tsx           Semana actual: subir menús por niña, generar (POST /api/menus/plan o
                       /generate), editar platos. Client component.
  guardados/
    page.tsx           Historial real (GET /api/history), cada uno con su "Ver". Client component.
  semana/[slug]/
    page.tsx           Vista de solo lectura de UNA semana guardada. Server component que lee
                       server/history/store.ts DIRECTAMENTE (mismo proceso, sin auto-llamarse por
                       HTTP) — slug es el id real del HistoryEntry, ya no hay
                       generateStaticParams (las semanas se crean en tiempo de ejecución).
  globals.css          Tokens shadcn (oklch) y un bloque @media print importante. Sin modo
                       oscuro — ver "Sin modo oscuro" más abajo antes de tocar esto.
components/ui/         10 primitivas: alert, badge, button, card, collapsible, dialog (escrita a mano
                       sobre base-ui, ver "Modales" abajo), drawer,
                       input, separator, tabs (tabs.tsx ya no se usa, ver "Rutas" abajo).
components/menu/       UI compartida entre las tres rutas anteriores:
  page-shell.tsx        El fondo gris + "tarjeta" blanca + layout en columna de cada página.
  app-header.tsx         Logo + título (ya sin botón "+", se quitó a petición).
  tab-nav.tsx            Los dos enlaces Planificador/Guardados (ver "Rutas" abajo).
  week-view.tsx          Tarjetas de día + exportar + Drawer de sustitución (real,
                        POST /api/menus/substitute) + confirmar y guardar (real, POST /api/history).
  day-card.tsx           DayCard + Meal — consumen FinalDayPlan/FinalDish de @/server/types
                        directamente (import type, sin coste en runtime), no un tipo propio.
  print-menu.tsx         Versión para @media print.
  rules-panel.tsx        Todas las reglas del menú, abiertas por defecto y ocultables.
lib/api.ts             Cliente HTTP del frontend hacia app/api/**: una función por endpoint,
                       maneja el parseo de errores ({error:{code,message}} → ApiError) en un sitio.
lib/menu-data.ts       Ya NO es mock data de una semana: solo sourceStyles/hasExternalLink (estilo
                       de los badges de fuente) + `ruleGroups` (texto de RulesPanel).
lib/week-dates.ts      dayLabel() (mostrar los DayName del backend, en minúsculas y
                       sin acentos) + getWeek(offset) (Lunes-Domingo a `offset` semanas de la de
                       hoy, con fechas de verdad) + relativeWeekLabel(offset) ("La semana que viene"…).
lib/utils.ts           cn() = twMerge(clsx(...))
public/                iconos e imágenes placeholder
app/api/**/route.ts    Endpoints del backend real — ver sección "Backend". El frontend SÍ los usa.
docs/arquitectura.md   4 diagramas Mermaid (arquitectura, pipeline, recorrido del usuario, modelo de
                       datos). Actualizarlos si cambian el pipeline, las rutas o las tablas.
server/db/             Modelo relacional del historial: schema.sql (DDL Postgres) + tables.ts (filas zod).
server/                Lógica del backend: pipeline de IA, motor de reglas, clientes de Gemini y
                       Tavily, historial. Ver server/README.md y la sección "Backend" más abajo.
```

Varios componentes de `components/menu/` y de `app/*/page.tsx` hacen `import type {...} from
'@/server/types'` — son imports de solo tipo (`import type`), TypeScript los borra por completo al
compilar (el propio `tsconfig.json` tiene `isolatedModules: true`, que obliga a esta distinción),
así que no meten código de servidor ni zod en el bundle del cliente. Es la fuente única de verdad
del shape de una semana/plato: no hay un tipo `Dish`/`DayPlan` propio del frontend que mantener en
paralelo y sincronizado a mano con el backend.

Cada pieza de `components/menu/` sigue el mismo estilo denso de una línea por componente; se
extrajeron a ficheros propios porque las comparten varias rutas, no por cambiar de convención.

## Rutas

`/` no es una página: `next.config.mjs` tiene un `redirects()` que manda `/` → `/planificador`
(307, redirección "no permanente" — es un mock, no hace falta cachearla para siempre). Planificador
y Guardados **eran pestañas de una sola página** (estado de React con `Tabs`); a petición explícita
pasaron a ser dos páginas de verdad con URL propia, así que ya no comparten componente ni estado:

- **`/planificador`** — la semana a planificar. **Por defecto es la semana que viene, no la
  actual** (`weekOffset` empieza en 1), a petición del usuario: siempre se planifica la siguiente.
  Las flechas ‹ › del header (`WeekPicker`, que se pasa como `title` de `AppHeader`) mueven a
  cualquier otra semana, el eyebrow muestra el texto relativo, y aparece "Volver a la semana que
  viene" si se ha movido. La semana elegida da `weekLabel`/`dateLabels` a `WeekView`, así que es
  la etiqueta con la que se guarda en el historial. `uploaded: { id, file, child }[]` (el `File` real, no solo
  el nombre) — cada archivo se sube bajo un campo de formulario con el nombre de la niña (`Aina` /
  `Iria`, `CHILDREN` en el propio fichero); por defecto se asigna a "Aina" y hay dos botones-pastilla
  dentro de cada chip para retocar a quién pertenece (el backend agrupa por ese nombre de campo, ver
  `parseSchoolMenuUploads` en `server/http.ts` — no hay una UI de "quién es cada archivo" más
  elaborada, es la mínima necesaria para que el contrato del backend sea usable). "Generar menú
  semanal inteligente" llama a `planFullWeek()` (`lib/api.ts` → `POST /api/menus/plan`, multipart);
  es la única forma de generar: **el botón "Probar con un menú de ejemplo" y su
  `EXAMPLE_SCHOOL_MENU` se quitaron a petición del usuario** (el estado vacío ya no ofrece ningún
  atajo; `generateFromSchoolMenu()` sigue en `lib/api.ts` como cliente de
  `POST /api/menus/generate`, pero ninguna pantalla lo usa). **El botón está deshabilitado mientras no haya ningún archivo subido** (a petición), con una línea ámbar debajo que explica por qué ("Sube el menú del cole de al menos una niña…"), para que no parezca roto. `handleGenerate` mantiene su propia comprobación por si acaso. Tarda **~1,9 min de media** con PDF reales (medido por el
  usuario; sin el Paso 1, `/api/menus/generate` ronda 45-60s) y puede fallar (cuota, red, etc.),
  así que hay un `Alert` de error real. Mientras genera se muestra `GenerationProgress`
  (`components/menu/generation-progress.tsx`): una barra que avanza en lineal hasta
  `EXPECTED_GENERATION_MS` (114 s) pero **se para en el 99%** mientras la petición siga en vuelo, y
  solo llega al 100% cuando responde (`generationDone`). Si termina antes, salta al 100% y se ve así
  600 ms antes de pintar la semana. Muestra también el tiempo restante estimado. Si se cambia
  mucho el tiempo real del pipeline, actualizar esa constante.
  **`DayCard` ya no lleva el badge "Cole"/"Fin de semana"** (a petición: "no aporta nada"), así que
  `isWeekendDay()` se eliminó.
- **`/guardados`** — `useEffect` en el montaje llama a `listHistory()` (`GET /api/history`) y pinta
  lo que devuelva de verdad; hay estados de carga/vacío/error explícitos. Cada fila enlaza a `/semana/{id real}` con `next/link`
  (`<Button render={<Link .../>} nativeButton={false}>` — ver el gotcha de `nativeButton` más
  abajo) — siempre, ya no hay un caso "Ver deshabilitado". **Cada fila tiene además una papelera**
  (`DeleteWeekButton compact`, `components/menu/delete-week-button.tsx`). Pide confirmación con
  `ResponsiveModal` ("No se puede deshacer"), llama a `deleteHistoryEntry()` (`DELETE
  /api/history/[id]`) y quita la fila de la lista sin recargar. `/semana/[slug]` tiene el mismo
  botón ("Borrar semana", junto a "Volver"), con `redirectTo="/guardados"` porque desde un Server
  Component no se puede pasar un `onDeleted`.
- **`/semana/[slug]`** — ver más abajo.

`TabNav` (`components/menu/tab-nav.tsx`) es la navegación Planificador/Guardados: **ya no** es el
componente `Tabs` de base-ui con estado compartido, son dos `<Link>` normales con la clase activa
calculada por una prop `active` que cada página pasa a mano (`'planner'` / `'history'`) — por eso
`components/ui/tabs.tsx` sigue en el repo pero no lo usa nada. `AppHeader` (logo + título) y
`PageShell` (fondo + tarjeta + layout en columna) son el resto de piezas compartidas entre
`/planificador` y `/guardados`; `/semana/[slug]` usa `PageShell` pero no `AppHeader`/`TabNav`
(tiene su propio `<header>` con un enlace "Volver").

**El header ya no tiene botón "+"**: se quitó a petición del usuario ("no aporta nada, ya que se
suben los menús desde el cuadrado verde") — la subida de archivos se hace solo desde la tarjeta
verde de `/planificador` (botón "Subir" o arrastrar). No volver a añadirlo.

### `WeekView` (`components/menu/week-view.tsx`)

Recibe `week: WeekPlan` (el tipo real del backend, `@/server/types`) + `weekLabel: string` +
`schoolMenu?: SchoolMenuExtraction` (para que la sustitución pueda comprobar "no repetir la comida
escolar" de ese día) + `dateLabels?` (fechas de verdad por día, ver `lib/week-dates.ts`) +
`title`/`subtitle`/`badgeLabel` opcionales, y es **autocontenido**: guarda su propia copia editable
de `days` (`FinalDayPlan[]`), gestiona el `selected`/`replace` y el `Drawer` de sustitución (real,
`substituteDish()` de `lib/api.ts`), pinta el grid de `DayCard` + el botón "Exportar
PDF / imprimir" + `PrintMenu`. La usan tanto `/planificador` (la semana recién generada) como
`/semana/[slug]` (una guardada) — es el único sitio con la lógica de "cambiar un plato", así que un
cambio ahí afecta a ambas vistas.

**`editable` (por defecto `true`) es lo que distingue las dos vistas — los guardados son histórico
de solo consulta, a petición explícita ("no se pueden modificar, solo verlos").** Con
`editable={false}` (así lo usa `/semana/[slug]`): `DayCard`/`Meal` reciben `onChange={undefined}`,
y `Meal` **no pinta el botón "Cambiar" en absoluto** si no hay `onChange` — no es un botón
deshabilitado, directamente no existe la posibilidad de tocar nada; el `Drawer` de sustitución
entero tampoco se monta (`{editable && <Drawer>...}`). El badge que antes siempre decía "Listo para
ti" ahora es configurable (`badgeLabel`); `/semana/[slug]` pasa `badgeLabel="Histórico"`.

**Los 14 huecos de la semana (comida+cena de los 7 días) son siempre sustituibles** — no hay ya
ninguna excepción por `sourceKind` ni por día: ver "Reglas dietéticas y la comida de lunes a
viernes" más abajo para por qué esto cambió respecto a una versión anterior de este documento.

**Abrir "Cambiar" ya NO busca nada** (a petición: "que no vaya a buscar inmediatamente a las
webs"). `openMeal()` solo abre el modal, que ofrece a la vez las dos formas de cambiar el plato:
- Un botón **"Buscar alternativas"** (`searchAlternatives()` → `substituteDish()`). Cuando hay
  resultados, aparece "Buscar otras alternativas" para repetir. Mientras busca se muestra **la
  misma barra de progreso que al generar la semana** (`GenerationProgress`, ahora con
  `expectedMs`/`title`/`description` configurables), calibrada a `EXPECTED_SUBSTITUTION_MS` = 60 s
  (a petición: "en principio pon 1 min"; ajustarlo si el tiempo real se aleja). No pasa del 99%
  hasta que responde, salta al 100% y se ve así 500 ms antes de pintar las alternativas.
- Debajo de un `Separator`, el formulario libre "O escribe tu propio plato": título (obligatorio),
  descripción/receta (textarea, opcional; se muestra en "Ver receta" respetando saltos de línea) y
  URL de origen (opcional: redes sociales, blogs…; se valida y se le pone `https://` si falta). Es
  puramente del cliente (`sourceName: 'Manual'`) y no pasa por el backend ni por las reglas. Con URL
  es `sourceKind: 'web'` + `sourceUrl`, así el badge "Manual" enlaza al original y "Ver receta" ofrece
  "Ver la receta original"; sin URL, `sourceKind: 'ia'`. Se guarda en `recipes.description`/`source_url`.

`searchId` (un `useRef` contador) descarta la respuesta de una búsqueda si mientras tanto se cerró
el modal o se abrió otro plato. Sin él, una búsqueda lenta pintaría alternativas del plato
anterior. `customTitle`/`alternatives`/errores se limpian tanto en `openMeal` como en
`closeDrawer`. Comprobado en Chrome (CDP): 0 llamadas a `/api/menus/substitute` al abrir, 1 al
pulsar el botón.

### Modales: centrados en escritorio, Drawer en móvil

Los dos modales de `WeekView` (cambiar plato y confirmar) usan `ResponsiveModal`
(`components/menu/responsive-modal.tsx`). A partir de `md` (768px, `matchMedia` vía
`useSyncExternalStore`) es un **Dialog centrado** (`components/ui/dialog.tsx`, escrito a mano sobre
`@base-ui/react/dialog`, con los `data-slot` `dialog-overlay`/`dialog-popup`). Por debajo es el
**Drawer** de siempre, que sube desde abajo. Los botones de cerrar van en `footer` con
`onClick → onOpenChange(false)`, no con `DrawerClose`/`DialogClose`, para que el mismo contenido
sirva en los dos. El `@media print` de `globals.css` oculta también `dialog-overlay`/`dialog-popup`,
por el mismo motivo que los del Drawer. Comprobado en Chrome headless a 1280×900 (Dialog centrado,
512px) y 390×844 (Drawer pegado abajo, sin overflow horizontal).

### "Ver receta" en cada plato

Cada `Meal` (`day-card.tsx`) tiene un "Ver receta" / "Ocultar receta", **cerrado por defecto** (a
petición: "que se muestre cuando el usuario quiera"), con la descripción, los ingredientes y
"Cómo se hace" (`FinalDish.steps`: 3-6 pasos breves). Los pasos los genera el Paso 4
(`RecipeSelectionSchema`): si la receta elegida es web, resume los pasos de la página; si es de
Gemini, los de su receta. `steps` es opcional: los platos manuales, los antiguos o los que se
quedaron como los planificó el Paso 2 no los tienen. Se muestra lo que haya y, si no hay nada, el
botón no aparece. En BD es la tabla `recipe_steps` (como `recipe_ingredients`).

### Confirmar planificación → Guardados

Solo cuando `editable`: botón "Confirmar planificación" (junto a "Exportar PDF / imprimir") que
abre un **segundo** modal (`ResponsiveModal`, independiente del de sustitución) con "¿Confirmar esta
planificación?", un botón "Imprimir menú semanal" (reutiliza `handlePrint` = `window.print()`) y
"Confirmar y guardar", que ahora llama de verdad a `saveHistoryEntry(weekLabel, { days,
generatedAt })` (`POST /api/history`) y, solo si eso responde bien, navega a `/guardados` con
`router.push` — con estado de guardando (`saving`, botón deshabilitado + spinner mientras la
petición está en vuelo) y de error (`saveError`, un `Alert` dentro del propio Drawer si falla, sin
cerrar el modal ni perder lo que se iba a guardar).

**Lo anterior era un puente 100% mock entre `/planificador` y `/guardados`** (un query param
`?confirmado=1` que `GuardadosContent` leía con `useSearchParams()` en un `useEffect`, con un
`useRef` para evitar que React Strict Mode lo disparara dos veces) — ya no existe: al llamar de
verdad a `POST /api/history` antes de navegar, `/guardados` simplemente vuelve a pedir la lista real
(`GET /api/history`) en su propio montaje y ahí aparece. Si se encuentra código o comentarios
mencionando ese query param en un diff antiguo, es rastro de la versión mock, ya no aplica.

**Lo que se imprime tiene que ser el menú semanal, nada más — ni el modal encima, ni el resto de la
pantalla.** Esto exigió dos arreglos en `@media print` (`globals.css`) más allá de lo que ya había:
- `[data-slot='drawer-overlay']` y `[data-slot='drawer-viewport']` a `display: none !important`.
  Sin esto, imprimir con el Drawer de confirmación abierto (el caso nuevo: "Imprimir menú semanal"
  se pulsa DESDE dentro del modal) mezclaba el modal superpuesto con el `<PrintMenu>` real —
  comprobado forzando `Emulation.setEmulatedMedia({ media: 'print' })` por CDP con el Drawer
  todavía abierto y leyendo `getComputedStyle` de esos `data-slot`.
- Ya de paso se limpió ruido que colaba en la impresión desde antes de este cambio y que también
  contradecía "que solo se imprima el menú": la tarjeta de subida de `/planificador`
  (`print:hidden` en el `<Card>`), el `<h2>{title}</h2>`/subtítulo de `WeekView` duplicando el
  título que `PrintMenu` ya pone por su cuenta (`print:hidden` en todo ese `<div>`, no solo en el
  subtítulo), y `RulesPanel` (que sin `print:hidden` dejaba una caja vacía — su único contenido
  visible es un `<button>`, ya oculto por la regla global `button { display: none !important; }`,
  pero el borde de la caja seguía imprimiéndose).

## `app/semana/[slug]/page.tsx` (una semana guardada)

Server component que ya **no** usa `generateStaticParams`: las semanas guardadas se crean en
tiempo de ejecución (al "Confirmar planificación"), no se conocen en el momento del build. `slug`
es el `id` real de un `HistoryEntry` (un UUID de `crypto.randomUUID()`, ver `server/history/store.ts`);
como este componente corre en el servidor, lee `getHistoryStore().get(slug)` **directamente en el mismo
proceso** — no hace un `fetch` a su propia API por HTTP, sería una vuelta innecesaria. Un `slug` que
no exista llama a `notFound()` (404). A propósito **no** lleva ni la tarjeta de subida ni el botón
"Generar" — pedido explícito: una semana guardada se ve tal cual, sin la opción de añadir menús del
cole (eso es solo de `/planificador`). Solo un enlace "Volver" a `/guardados` + el
`<WeekView editable={false} badgeLabel="Histórico">` de esa semana.

### Lista de la compra y pestañas del detalle (`components/menu/saved-week-tabs.tsx`)

`/semana/[slug]` tiene dos pestañas (estado local, mismo aspecto que `TabNav`): **"Menú semanal"**
(`RulesPanel` + `WeekView` de solo lectura) y **"Lista de la compra"** (`ShoppingListView`). La lista
cubre comida **y** cena de los 7 días con `PEOPLE_BY_DAY` (`server/prompts/shoppingList.ts`): 1
persona de lunes a jueves, 2 el viernes, 4 sábado y domingo (a petición; se aplica a las dos comidas).
- Una llamada a Gemini Flash (`server/pipeline/shopping-list.ts`) suma los ingredientes (que no
  llevan cantidades) y devuelve `ShoppingList` (`items` con `name`, `quantity`, `category`).
- **Se genera la primera vez que se abre la pestaña** (`POST /api/history/[id]/shopping-list`, con
  `GenerationProgress`) y se guarda (`HistoryStore.setShoppingList`, columna `saved_weeks.shopping_list
  jsonb`, `HistoryEntry.shoppingList`); las siguientes veces llega ya en la entrada. No se genera al
  confirmar para no alargar el guardado ni perderlo si Gemini falla.
- **BD**: `postgres-store.ts` hace `ALTER TABLE ... ADD COLUMN IF NOT EXISTS shopping_list` una vez
  por proceso (el `db:migrate` solo vale para una BD vacía). `schema.sql` ya la incluye.
- Modo pruebas: `fake-gemini.ts` devuelve una lista falsa (lee el formato del prompt).

### Fuentes de un plato y estilos (`lib/menu-data.ts`)

Ya no hay tipos ni datos de una semana propios del frontend — `FinalDish`/`FinalDayPlan`/`WeekPlan`
vienen de `@/server/types` (`import type`, ver "Estructura" arriba). `lib/menu-data.ts` se quedó
solo con lo puramente de presentación:

- **`sourceStyles`**: color de badge por `sourceName` — el mismo vocabulario que usa
  `FinalDish.sourceName` de verdad: `Generado por IA` (verde), `Cookidoo` (naranja), `El Comidista`
  (azul), `Cookpad` (rosa), `Directo al Paladar` (ámbar), `Petitchef` (violeta), `Manual` (gris,
  para el plato escrito a mano en el Drawer — eso sigue siendo puramente del cliente). Ya no existe
  un source `Colegio`: el menú escolar nunca se muestra como un plato, ver más abajo.
- **`hasExternalLink(source)`**: lista de exclusión (`Generado por IA`, `Manual` no llevan el
  icono de enlace externo, el resto sí). En `Meal` (`day-card.tsx`) esto solo decide el
  icono dentro del badge — el badge en sí solo se envuelve en un `<a href>` de verdad cuando
  `data.sourceKind === 'web' && data.sourceUrl`, así que aunque se olvide añadir una fuente nueva
  aquí, nunca se generaría un enlace falso, solo faltaría el icono decorativo.

### Reglas dietéticas y la comida de lunes a viernes

`ruleGroups` (`lib/menu-data.ts`) es texto informativo, no se valida en el frontend: las reglas de
verdad las aplica el motor de reglas del backend (`server/rules/`, ver "Backend"). Los números
(máximos, minutos) se importan de `server/rules/constants.ts`, que son constantes puras sin zod,
así que no se desincronizan; el texto sí hay que mantenerlo a mano. **`RulesPanel` está abierto por
defecto, a petición ("poder verlas y tenerlas en cuenta"), y se puede ocultar** con
"Ocultar"/"Mostrar". La preferencia se guarda en `localStorage` (`mesamia:rules-panel-open`) y es
la misma para las dos páginas. Se muestra agrupado (Equilibrio semanal / Ingredientes / Lunes a
viernes) en dos sitios: en `/planificador`, encima del botón Generar y antes de generar nada, y en
`/semana/[slug]` con una `note` que avisa de que son las reglas actuales (una semana guardada puede
ser de antes de alguna). No está dentro de `WeekView`: cada página lo pone por su cuenta.

Debajo de las reglas, el mismo panel lista las **"Fuentes de recetas"** (a petición): los 5 sitios
en los que se busca con Tavily, con su enlace y el mismo color de badge que en los platos. Salen de
`server/clients/recipe-sources.ts` (`RECIPE_SOURCES`), un **módulo puro** (sin `@tavily/core`,
env ni zod) que importan tanto `server/clients/tavily.ts`, para filtrar resultados, como
`lib/menu-data.ts` (`recipeSources`), para pintarlos. Así lo que se ve es siempre lo que se
consulta. Si se añade o quita un sitio, se hace solo ahí; `homeUrl`/`note` son solo de
presentación.

**Esta app tuvo, en algún punto, dos versiones contradictorias de qué es la "Comida" de lunes a
viernes**, y se resolvió dos veces en direcciones opuestas — la que queda vigente es la segunda,
por instrucción explícita y sin ambigüedad del usuario: *"no me interesa saber lo que comen mis
hijas, solo quiero que gener[e] comidas para nosotros. La comida de mis hijas tiene que tenerla en
cuenta para no repetir la misma comida para la cena, ya está, solo sirve para eso el menú de Aina y
el de Iria."* En una versión intermedia (ya no vigente) ese hueco llegó a mostrar el menú escolar
real de las niñas (con badge "Colegio"), porque el pipeline solo planificaba 9 huecos y colocaba
ahí el dato del Paso 1 al no generar nada propio para los padres. **Eso quedó descartado**: la
comida de lunes a viernes es ahora un plato real generado por IA para los adultos de la casa, **el
menú escolar nunca ocupa un hueco ni se muestra en ningún sitio** — solo entra como contexto en el
Paso 2 para que la cena de ese día no repita categoría de proteína ni ingredientes con lo que las
niñas ya comieron en el cole. Ver "El pipeline, en una frase por paso" más abajo para el diseño
vigente.

**Actualización posterior (vigente), también a petición explícita**: el menú de **Aina** ya no
sirve solo para no repetir. El usuario pidió *"tener en cuenta la propuesta de cena que dice el
menú de Aina y también la comida que va a tener ella para tener cosas semejantes"*, y al preguntarle
eligió estas dos opciones:
- **La comida de los adultos de lunes a viernes se PARECE a lo que come Aina** en el cole ese día
  (mismo tipo de plato o proteína principal, en versión adulta).
- **La cena se INSPIRA en la "proposta de sopar"** que trae el menú de Aina para cada día. Es solo
  una sugerencia, no una obligación.

La regla de que la cena no repite lo del cole **se mantiene** y va por encima de la proposta. El
menú escolar sigue sin ocupar un hueco ni mostrarse. Iria (guardería) solo cuenta para no repetir.
Ver "Menú escolar de Aina: comida parecida y proposta de sopar" más abajo.

## Backend (`server/` + `app/api/**`)

Pipeline de IA real para generar/sustituir menús, con endpoints de Next.js (App Router Route
Handlers) encima. **Contratos completos de cada endpoint, con ejemplos de `curl`, están en
`server/README.md`** — aquí solo lo que hace falta para no tener que releer todo el código.

**El frontend ya llama a estos endpoints de verdad** (ver "Rutas" arriba): `lib/api.ts` es el
cliente HTTP del lado del cliente para los 6; `app/semana/[slug]/page.tsx` es la única excepción —
como corre en el servidor, lee `server/history/store.ts` directamente en vez de hacer un `fetch` a
su propia API.

### Variables de entorno — nunca hardcodear claves

`GEMINI_API_KEY` y `TAVILY_API_KEY` se leen solo en `server/env.ts` (`requireEnv()`), que lanza un
`ConfigError` con mensaje explícito si faltan — comprobado de verdad pegándole a los endpoints sin
esas variables puestas: responden `500 config_error` limpio, no un stack trace. Plantilla en
`.env.local.example` (copiar a `.env.local`, que ya está en `.gitignore` vía el patrón
`.env*.local` que ya traía el proyecto). Modelos configurables por env (`GEMINI_MODEL_FLASH`,
`GEMINI_MODEL_PRO`), con default si no se fijan — nunca una versión de modelo hardcodeada a pelo
sin forma de cambiarla.

**`.env.local` ya tiene claves reales puestas** (el usuario las dio en el chat; se guardaron solo
ahí, nunca en el código ni en un mensaje/commit). Es una clave de Gemini de nivel gratuito — ver
"Credenciales reales configuradas" más abajo para las limitaciones de modelo que eso implica.

### El pipeline, en una frase por paso

1. **Extracción** (`server/pipeline/step1-extract-school-menu.ts`, Gemini Flash) — una llamada
   **por niña** (no una mezclando todos los documentos): el cliente ya dice de forma fiable a
   quién pertenece cada archivo (el nombre del campo del formulario), así que Gemini no tiene que
   adivinar esa atribución, solo extraer.
2. **Planificación** (`step2-plan-week.ts`, Gemini Pro) — pide los 14 "huecos" (comida y cena de
   los 7 días, **todos**, incluida la comida de lunes a viernes: ese hueco es para los adultos de
   la casa, ver "Reglas dietéticas y la comida de lunes a viernes" más arriba) y valida el
   resultado con `server/rules/engine.ts`, que es código determinista, no el LLM marcando su
   propia tarea. Si incumple algo, reintenta pasándole el detalle exacto de qué falló (hasta 3
   veces) — es lo que convierte esto en un pipeline con verificación, no una llamada a ciegas. El
   menú escolar de las niñas se le da como contexto para tres cosas: que la comida de los adultos
   se parezca a la de Aina, que la cena se inspire en su "proposta de sopar", y que la cena no lo
   repita (ver "Menú escolar de Aina" más abajo).
3. **Candidatas** (`step3-fetch-recipes.ts`, Tavily) — una búsqueda por plato, todas en
   `Promise.all` (concurrentes, como pide el enunciado). Restringida a `cookidoo.es`,
   `elpais.com/gastronomia/el-comidista`, `directoalpaladar.com`, `cookpad.com`, `petitchef.es`
   (`server/clients/recipe-sources.ts`, `RECIPE_SOURCES`). `searchRecipeCandidates` devuelve **hasta 3
   candidatas**, de sitios distintos siempre que puede. Solo acepta páginas de UNA receta
   (`recipePath` por sitio: sin `cookpad.com/es/buscar/...` ni páginas de categoría) con al menos
   `MIN_CANDIDATE_CHARS` (800) de contenido. **Además, una búsqueda aparte solo en Cookidoo**
   (ver "Cookidoo" abajo), que añade una 4ª candidata. Aquí no se elige ninguna.
4. **Elección** (`step4-consolidate.ts` → `selectRecipes`, Gemini Flash; es una llamada por plato,
   como antes) — Gemini compara las candidatas con **su propia receta** del plato y se queda con la
   mejor (`RecipeSelectionSchema`: `choice` `'ia' | '1'…'4'` + `reason` + la receta
   estandarizada). Una candidata solo vale si es de verdad el plato planificado y cumple las
   restricciones. Si elige `'ia'`, escribe una receta completa con todos sus ingredientes, tiempo
   y dificultad. Sin candidatas elige `'ia'`; nunca se inventa una fuente web (un `choice` que no
   corresponde a ninguna candidata se trata como `'ia'`).
   **Por qué existe**: antes el Paso 3 cogía el PRIMER resultado de Tavily y el Paso 4 solo lo
   limpiaba. Tavily casi siempre devuelve algo, así que casi el 100% de los platos acababan siendo
   web, aunque la página fuera otro plato o un listado de búsqueda (detectado por el usuario). En
   la primera prueba real con la elección, el reparto fue 3 IA / 7 Cookpad / 3 Directo al Paladar /
   1 Cookidoo, y los motivos tenían sentido: "la candidata tarda 60 min un martes", "las tres
   candidatas son variantes (al horno, guisada, con queso), no la tortilla clásica".
5. **Ensamblado** (`assemble.ts`) — construye el JSON final de 7 días, todo a partir del Paso 2
   (enriquecido por el Paso 4 si hubo receta). El menú escolar no interviene aquí en absoluto: solo
   fue contexto para el Paso 2, nunca se convierte en un `FinalDish`.

`server/pipeline/orchestrator.ts` expone `generateFromSchoolMenu()` (pasos 2-4, usado por
`POST /api/menus/generate`) y `planFullWeek()` (1-4 de una
vez, usado por `POST /api/menus/plan` y por el botón "Generar" real de `/planificador`);
`server/pipeline/substitute.ts` es la versión de un solo hueco con N alternativas — es exactamente
lo que dispara el botón "Cambiar" real del Drawer de `WeekView`, ver "Rutas" arriba.

### Por qué el menú escolar nunca ocupa un hueco

A petición explícita del usuario, el menú del cole/guardería de Aina e Iria **no es información que
la app tenga que mostrar** — a nadie le interesa ver ahí lo que comen las niñas. Su único propósito
es servir de contexto en el Paso 2 (y en la sustitución) para que la cena de cada día de cole no
repita categoría de proteína ni ingredientes con lo que ellas ya comieron. Por eso `PLANNED_SLOTS`
cubre los 14 huecos reales (comida+cena de los 7 días) y `assembleWeek`/`dishFromPlannedSlot`
(`server/pipeline/assemble.ts`) no tienen ninguna rama que construya un `FinalDish` a partir del
menú escolar — `DishSourceKindSchema` ni siquiera admite un valor `'escolar'` (solo `'ia' | 'web'`),
y `FinalDish` no lleva ya un campo `child`. Una versión anterior de este documento describía lo
contrario (el pipeline solo planificaba 9 huecos y colocaba el menú escolar real en la comida
L-V) — quedó descartado por completo, ver "Reglas dietéticas y la comida de lunes a viernes" arriba.

### Aviso si el menú del cole no es de la semana planificada (`lib/school-dates.ts`)

A petición: *"si el menú que estoy adjuntando no coincide con las fechas, cuando termine de
generarlo, me saque un aviso"*. Funciona así:
- **El Paso 1 lee las fechas**: `ChildSchoolMenu.menuStartDate`/`menuEndDate` (YYYY-MM-DD,
  opcionales, solo si el documento las indica; nunca se deducen). Recibe además la semana que se
  planifica (`weekStart`, que `/api/menus/plan` y `/extract` aceptan como campo de texto,
  `parseWeekStartField` en `server/http.ts`). Con ella elige la semana correcta de un **menú
  mensual** y pone el año a fechas que no lo traen ("12 d'octubre"). Las fechas mal formadas se
  descartan en `extractSchoolMenu`.
- **La comparación es código, no la IA**: `checkSchoolMenuDates(schoolMenu, weekStart)` es una
  función pura del frontend. Un menú coincide si su rango se solapa con el lunes-viernes
  planificado (si solo hay inicio, se asumen 5 días). Devuelve `mismatched` (con el rango para
  mostrarlo) y `unknown` (menús sin fechas).
- **En pantalla**: `SchoolDatesNotice` en `/planificador`, entre el botón Generar y la semana.
  - Si alguna fecha no coincide: `Alert` ámbar con "El menú de las niñas que has subido no coincide
    con la semana que estás planificando (…)" y el rango de cada menú.
  - Si un documento no trae fechas: una línea gris, "No hemos podido comprobar las fechas…".

  Se calcula en cada render con la semana elegida, así que **cambiar de semana con las flechas
  después de generar actualiza el aviso** sin regenerar. El menú se genera igualmente, porque el
  aviso no bloquea.
- **Probado** con 3 PDF sintéticos en catalán y Gemini real: "Setmana del 12 al 16 d'octubre" sin
  año planificando el 5-11 dio `2026-10-12 → 2026-10-16`; uno sin fechas no dio ninguna; y uno
  mensual de 2 semanas planificando el 12-18 extrajo la segunda semana. En Chrome, el aviso aparece
  tras generar y desaparece al pasar a la semana que coincide. No se ha probado con los PDF reales.

### Menú escolar de Aina: comida parecida y proposta de sopar (`server/prompts/schoolContext.ts`)

- **Extracción (Paso 1)**: `SchoolMealEntry` tiene un campo opcional `dinnerSuggestion`, que es la
  "proposta de sopar" (o "propuesta de cena", "per sopar"...) copiada tal cual, sin traducir. Si el
  menú no la trae (el de Iria), se omite y nunca se inventa.
- **Contexto para el LLM**: `formatSchoolDay`/`formatSchoolWeek` pasan el menú escolar a texto, un
  día por bloque, con lo que come cada niña (proteína e ingredientes) y la proposta si la hay.
  Sustituye al `JSON.stringify(schoolMenu)` de antes. `SCHOOL_CONTEXT_LINES` son las instrucciones:
  comida de adultos parecida a la de `REFERENCE_CHILD` (`'Aina'`), cena inspirada en su proposta y
  regla de no repetir obligatoria. Lo comparten la planificación y la sustitución.
- **Es orientación para el LLM, no una regla del motor**: el "parecido" no se valida con código. Lo
  que sí sigue siendo determinista es el no repetir en la cena y los límites semanales. Ojo: como la
  comida de los adultos copia la proteína del cole, si Aina come carne roja ese día, esa comida se
  lleva el único cupo semanal de carne roja.
- **De paso se arregló** que el prompt de "Buscar alternativas" decía "(se te da como contexto)"
  refiriéndose a la comida escolar, pero nunca la incluía. Gemini proponía a ciegas y solo el motor
  de reglas lo cazaba después, con un reintento. Ahora recibe `formatSchoolDay` de ese día.
- **Probado** con un PDF sintético en catalán que imitaba el de Aina (5 días con "Proposta de
  sopar"): la extracción leyó las 5 propuestas literalmente. En la planificación, solo Paso 2, la
  comida de adultos coincidió en tipo con la de Aina los 5 días, y la cena siguió la proposta en 4.
  El miércoles se apartó correctamente: la proposta era de garbanzos, pero Iria comía lentejas y
  una cena de legumbre habría repetido proteína. Salieron 0 violaciones en 2 intentos. **No se ha
  probado con el PDF real de Aina.**

### Cookidoo: búsqueda aparte (opción B, elegida por el usuario por coste de Tavily)

Antes casi nunca salía Cookidoo, y no era un fallo. Se investigó con 5 platos típicos:
- En la búsqueda general (los 5 sitios a la vez), Cookidoo no entró ni una vez entre los 8
  primeros resultados.
- Cuando entra, más de la mitad de sus resultados vienen con ~160 caracteres, así que el filtro
  de 800 las descarta.
- Sus páginas públicas traen ingredientes, tiempo y dificultad, pero **no los pasos**: son solo
  para suscriptores. Todas son recetas de Thermomix.

**La familia tiene Thermomix y suscripción**, así que ahora, por cada plato y en paralelo con la
búsqueda general, se hace esto:
1. `searchCookidooRecipeUrl`: una búsqueda `basic` solo en `cookidoo.es`, 1 crédito, solo para
   sacar la URL de la primera receta.
2. `extractPages`: UNA llamada a `extract` (`basic`, `format: 'text'`) con todas esas URLs de la
   semana a la vez (1 crédito por cada 5 páginas; hasta 20 URLs por llamada).

La receta se añade como candidata extra, salvo que la general ya trajera una de Cookidoo. El
prompt del Paso 4 dice que hay Thermomix + suscripción y que no se penalice que falten los pasos.
Si elige Cookidoo, `selectRecipes` **vacía `steps`** (serían inventados), y "Ver receta" muestra
"Ver los pasos en Cookidoo (con tu suscripción)" enlazando a la receta. Ese enlace aparece en
cualquier receta web sin pasos, no solo en Cookidoo.

**Coste**: ~28 → ~45 créditos de Tavily por semana generada (+14 búsquedas `basic` + ~3 de
extract), y ~6 → ~10 por "Buscar alternativas". Las opciones descartadas fueron: A, búsqueda de
Cookidoo en `advanced` (~59 créditos); y C, pasar también la búsqueda general a `basic` (~31
créditos, pero con riesgo de empeorar las recetas de las otras webs, sin probar).

**Resultado real**: con 6 platos clásicos (crema de calabaza, merluza en salsa verde, tortilla,
curry, lentejas, salmón), Cookidoo llegó como candidata en los 6 y ganó en 5. En una semana
completa ganó solo en 1 de 14, porque Gemini planifica platos más elaborados ("Crema de calabacín
con picatostes", "Hummus con crudités") y la búsqueda de Cookidoo encuentra otro plato o ninguno.
Es lo esperado, no un fallo.

### Modo pruebas: sin Gemini ni Tavily (`?pruebas=1`)

Sirve para seguir desarrollando sin gastar tokens ni créditos. Está oculto: se activa con
`?pruebas=1` en la URL, se recuerda en `sessionStorage` para el resto de la pestaña y se desactiva
con `?pruebas=0`. Mientras está activo se ve la pastilla "Modo pruebas · sin IA" abajo a la derecha
(`TestModeBadge`, dentro de `PageShell`).

- **Cómo llega al servidor**: `lib/api.ts` (`apiFetch`) añade la cabecera `x-mesamia-pruebas: 1`.
  Cada ruta de `app/api/**` envuelve su handler en `withTestMode(request, …)`
  (`server/test-mode.ts`, con `AsyncLocalStorage`), y dentro `isTestMode()` es `true` sin pasar un
  flag por todo el pipeline. `/semana/[slug]` es un Server Component y no recibe esa cabecera: lee
  `?pruebas=1` de `searchParams`, que `/guardados` añade a sus enlaces en ese modo.
- **Qué se sustituye, y solo eso**: `generateStructured` (`server/clients/gemini.ts`) y las tres
  funciones de `server/clients/tavily.ts` devuelven datos de `server/testing/fake-gemini.ts` y
  `fake-tavily.ts`. **Todo lo demás corre igual**: motor de reglas con reintentos, restricciones
  sobre la receta elegida, ensamblado, historial de gustos, aviso de fechas y guardado. La salida
  del Gemini falso se valida con el mismo esquema zod.
- **El Gemini falso no es aleatorio**: elige qué devolver según el esquema pedido (extracción,
  planificación, alternativas o elección de receta). Lo que necesita (día, menú escolar, semana
  actual…) lo lee del propio prompt con regex, así que **si se cambia el formato de
  `server/prompts/*`, revisar `fake-gemini.ts`**.
  - El planificador falso arma semanas que cumplen las reglas: probado, 0 violaciones.
  - Las alternativas avanzan en cada "Buscar otras alternativas".
  - La elección de receta reparte entre IA, Cookpad y Cookidoo, para probar también el enlace "Ver
    los pasos en Cookidoo".
  - Las URLs de Tavily falso son las **páginas de búsqueda** del plato en Cookpad/Cookidoo, que
    existen; no son recetas inventadas.
- **Historial aparte**: en modo pruebas, `getHistoryStore()` usa **siempre**
  `.data/mesamia-db.pruebas.json`, aunque haya Postgres configurado. Las semanas de prueba nunca
  llegan a Supabase ni al histórico real, ni la IA aprende gustos de ellas. Por eso ya no existe el
  singleton `historyStore`: siempre se pide `getHistoryStore()`, porque el modo se decide por
  petición.
- **Probado**: la semana se genera en ~1,5-2,5 s (frente a ~1,9 min) con 0 violaciones. Se
  comprobó que guardar en modo pruebas deja la BD real idéntica byte a byte (md5), que Guardados y
  el historial de gustos no se mezclan entre modos, y el recorrido completo en Chrome (activar,
  generar, confirmar, Guardados, abrir la semana, desactivar).

### Historial de gustos: la IA aprende de las 3 semanas anteriores (`server/history/taste-context.ts`)

A petición: *"cuando el LLM analice la semana que tiene que crear, vea las 3 semanas anteriores
para que aprenda de los gustos y modificaciones"*. **Antes esto no existía de verdad**:
`planWeek` ya tenía un parámetro `history` (`HistorySummary`, que se eliminó), pero el frontend
nunca lo rellenaba, y al guardar una semana no quedaba rastro de lo que se había cambiado.

- **Qué se guarda**: al "Confirmar y guardar", `WeekView` compara la propuesta original (`week.days`,
  la prop, que no se modifica) con el estado final (`diffChanges`, comparando título + URL). Cada
  hueco distinto es un `MealChange { day, meal, proposedTitle, kind }`, con `kind` `'manual'` si
  el plato final es `sourceName: 'Manual'` y `'alternativa'` si no. Va en `POST /api/history`
  (`changes`) y en BD son las columnas `week_meals.proposed_title` + `change_kind` (ambas NULL =
  aceptado tal cual). Las semanas guardadas antes de esto no tienen cambios y cuentan como "todo
  aceptado".
- **Qué ve el LLM**: `getTasteContext(weekStart)` elige las 3 semanas guardadas **estrictamente
  anteriores** a la que se planifica (si una semana se guardó varias veces, cuenta la última) y
  las formatea en texto, una línea por plato: "aceptado tal cual" / "CAMBIADO: la IA había
  propuesto X" / "ESCRITO A MANO …". `TASTE_CONTEXT_INSTRUCTIONS` le dice cómo interpretarlo: lo
  escrito a mano es la señal más fuerte, lo aceptado es débil, que busque patrones, que no repita
  platos de la semana anterior y que las reglas mandan siempre. Se calcula en el momento desde el
  `HistoryStore` (no hay un fichero aparte que mantener).
- **Dónde se usa**: el servidor lo añade solo en `/api/menus/plan`, `/generate` y `/substitute`,
  a partir de `weekStart`, que ahora manda el frontend. `GET /api/history/context?weekStart=` devuelve
  exactamente ese texto (para depurar), y el planificador lo usa para decir debajo del botón
  Generar qué semanas tendrá en cuenta la IA.
- **Probado**: la selección de semanas por la API; el guardado de un cambio "escrito a mano" desde
  Chrome; y solo el Paso 2 con Gemini, con y sin historial, sobre semanas de prueba que pedían
  curry, pasta y pizza y rechazaban hummus, cremas y salmón con boniato. Con historial salieron 2
  platos de pasta (uno "boloñesa", como el escrito a mano) y una pizza, y desaparecieron el hummus
  y las cremas, con 0 violaciones en ambos casos. El curry no apareció.
- **De paso se arregló** que `/planificador` no pasaba `key` a `WeekView`: al generar una segunda
  semana en la misma sesión, `WeekView` conservaba los `days` de la primera en su estado interno.
  Ahora lleva `key={week.generatedAt}`.

### Restricciones de la familia (`server/rules/restrictions.ts`)

Pedidas por el usuario, además de los límites semanales de proteína:
- Sin marisco (crustáceos y bivalvos). **Pota, calamar, pulpo y sepia sí están permitidos**, y se
  clasifican como `pescado`, así que cuentan para el máximo semanal de pescado.
- Sin champiñones y sin tofu (`OTHER_BANNED`; solo champiñones, no todas las setas).
- Sin atún (ni bonito del norte) y sin aceitunas. El aceite de oliva sí está permitido: por eso la
  lista usa "olivas" en plural y nunca "oliva".
- El único pescado es merluza (o pescadilla) o salmón, además de los cefalópodos. Cualquier otro
  pescado está prohibido **también como ingrediente secundario** (anchoas en una pizza, por
  ejemplo). Un plato `pescado` tiene que nombrar la especie; "pescado blanco" no vale.
- De lunes a viernes (comida y cena), la receta tiene que ser `difficulty: 'facil'` y durar
  `totalTimeMinutes ≤ 50`. A Gemini se le pide apuntar a 40 (`TARGET_WEEKDAY_MINUTES` /
  `MAX_WEEKDAY_MINUTES` en `constants.ts`). El fin de semana no tiene límite.

Para esto `PlannedDish`, `ConsolidatedRecipe` y `FinalDish` llevan `totalTimeMinutes` y
`difficulty`: Gemini los estima al planificar y los extrae de la página web al consolidar. En
`FinalDish` son opcionales porque las semanas antiguas y los platos manuales no los tienen.
`DayCard` los muestra ("30 min · Fácil"), y en BD son las columnas
`recipes.total_time_minutes`/`difficulty`.

Estas reglas se comprueban **dos veces**, siempre con código determinista:
1. En `validateWeekDraft` (Paso 2 y sustitución), sobre título + `mainIngredients`, con reintento
   como el resto de reglas.
2. En `selectRecipes` (Paso 4), sobre la **receta elegida**, web o propia de Gemini, porque una
   paella de Cookidoo puede traer gambas aunque el plato planificado no las mencionara. Si incumple
   algo, se descarta y el hueco se queda con el plato tal cual lo planificó el Paso 2, que ya pasó
   la validación.

La detección es por palabra completa con plural opcional; no es NLP. Un ingrediente que no esté en
las listas no se detecta: ampliar las listas si aparece alguno. Se probó con 21 casos (calamares,
chipirones, "aceite de oliva", anchoas, zamburiñas, cocido un miércoles frente a un domingo...) y
con una generación real contra Gemini y Tavily, que dio 0 violaciones.

### "Tipología del plato" y el motor de reglas

El enunciado no define qué es "tipología del plato" más allá de las 4 categorías que sí acota
(huevo/ave/pescado/carne roja) + legumbres. Se interpretó como la categoría de proteína
(`ProteinCategory`: `huevo | ave | pescado | carne_roja | legumbre | otro`), la lectura más
concreta y comprobable — es la que usa `validateWeekDraft()` tanto para el límite de "no repetir
respecto al cole" como para los máximos/mínimos semanales. El solape de ingredientes es una
heurística de texto (normaliza acentos/mayúsculas, compara por igualdad o contención — "pollo"
casa con "pechuga de pollo"), no NLP real; ver los comentarios de `server/rules/engine.ts` antes de
tocarla.

### Historial (`server/history/store.ts`)

Interfaz `HistoryStore` pequeña a propósito, para poder cambiar la implementación sin tocar rutas
ni pipeline. Modelo relacional en `server/db/schema.sql` (DDL de PostgreSQL, hoy no se ejecuta en ningún
sitio) y su espejo zod en `server/db/tables.ts`, con los mismos nombres de tabla y columna:

```
saved_weeks 1 ──< week_meals >── 1 recipes 1 ──< recipe_ingredients
                                             1 ──< recipe_steps
```

- `saved_weeks`: una fila por semana confirmada (`label`, `week_start` = lunes de la semana
  elegida en el planificador, `generated_at`, `created_at`).
- `week_meals`: los 14 huecos de cada semana (PK `week_id, day, meal`) → `recipe_id`.
- `recipes`: catálogo de recetas compartido entre semanas, **inmutable y direccionado por
  contenido**: `fingerprint` (UNIQUE) es un sha256 de todo el plato. Un plato idéntico reutiliza la
  fila y cualquier diferencia crea otra, así que guardar una semana nueva nunca altera una antigua.
- `recipe_ingredients`: ingredientes en orden (PK `recipe_id, position`), texto libre.
- `recipe_steps`: pasos de "cómo se hace" en orden (PK `recipe_id, position`).

Borrar una semana borra sus `week_meals` (CASCADE) **y las recetas que se quedan sin usar** (con
sus ingredientes y pasos). Las que comparte con otra semana guardada se quedan. Antes las recetas
se conservaban siempre en el catálogo; cambió a petición ("no quiero tener ese histórico").

**Almacenamiento actual: Supabase (Postgres).** Si hay `DATABASE_URL` (o `POSTGRES_URL`, la que inyecta la integración Supabase↔Vercel), `server/history/store.ts`
exporta `createPostgresHistoryStore()` (`server/history/postgres-store.ts`, driver `pg`, pool de 3,
SSL sin verificar cadena porque el pooler de Supabase no encadena). `DATABASE_URL` es el pooler
transaccional (6543) y `DATABASE_URL_DIRECT` el de sesión (5432), ambos en `.env.local`. El esquema
se aplicó con `pnpm db:migrate` (`scripts/db-migrate.mjs`, una sola vez: falla si ya existe). Las 5
tablas tienen RLS activado **sin políticas**, para que la clave anon de Supabase (pública) no pueda
leer ni escribir; la app solo entra por la conexión Postgres del servidor. El guardado es una
transacción, y borrar una semana borra en la misma transacción las recetas huérfanas. Solo se
usan esas dos variables: las claves `SUPABASE_*` y `NEXT_PUBLIC_SUPABASE_*` no se usan (no hay
cliente supabase-js). **Sin `DATABASE_URL`** vuelve al JSON local (`.data/mesamia-db.json`, o
`os.tmpdir()` en Vercel, efímero): útil en local, pero en Vercel en Vercel sin ninguna de las dos URL el store
falla con `ConfigError` (`500 config_error`) en vez de caer al JSON en silencio. Probado con
la BD real: guardar → listar → abrir `/semana/<id>` → reiniciar el servidor (sigue ahí) → borrar.

### Credenciales reales configuradas — el pipeline SÍ se ha probado contra Gemini y Tavily de verdad

`.env.local` tiene `GEMINI_API_KEY`/`TAVILY_API_KEY` reales (nunca en el código, siempre por env —
ver "Variables de entorno" arriba). Con ellas puestas, se ejecutó de verdad (no solo `tsc` ni
errores simulados) `POST /api/menus/generate` completo y `POST /api/menus/substitute`, además de
llamadas sueltas a `generateStructured` y `searchRecipe`. Antes de eso también se verificó sin
claves (los 6 endpoints devuelven el código/forma de error correctos ante config ausente, body
inválido, archivo no soportado, id de historial inexistente) y el motor de reglas + ensamblado con
datos sintéticos — ambas rondas usando una ruta de diagnóstico temporal, creada y borrada en la
propia sesión (**nota**: una carpeta de ruta que empieza por `_`, p. ej. `app/api/_debug/...`, es
"privada" en el App Router y Next la excluye del enrutado sin avisar — 404 silencioso, no un error;
si se crea otra ruta de diagnóstico temporal, no usar ese prefijo).

Tres cosas que solo se descubrieron probando con la API real (ninguna la detectaba `tsc` ni los
tests con datos sintéticos):

1. **`GEMINI_MODEL_PRO` no podía ser un modelo Pro de verdad con esta clave (nivel gratuito)**:
   `gemini-2.5-pro` da 404 ("no longer available to new users"), y `gemini-3.1-pro-preview` —el
   que el propio error de Google sugiere como sustituto— da 429 (cuota 0 en ese nivel). El default
   quedó en `gemini-2.5-flash` (el mismo modelo que `GEMINI_MODEL_FLASH`), documentado como tal en
   `server/env.ts` — no es una limitación de esta app, es de la cuenta/clave; con una clave de pago
   se puede fijar un Pro real por variable de entorno sin tocar código.
2. **Las 3 alternativas de `/api/menus/substitute` salían con el mismo título y la misma receta**,
   solo cambiaba `proteinCategory`. Causa: `server/pipeline/step3-fetch-recipes.ts` y
   `step4-consolidate.ts` indexaban por `slotKey(day, meal)` — funciona para una semana completa
   (cada combinación día+comida es única entre los 14 huecos), pero las N alternativas de un mismo
   hueco de sustitución comparten día y comida, así que las 3 colisionaban en la misma clave del
   `Map` y se sobrescribían. Arreglado pasando la clave explícitamente desde quien llama (`{ key,
   dish }` en vez de derivarla dentro de `fetchRecipes`/`dishFromPlannedSlot`): la generación de
   semana completa sigue usando `slotKey(day, meal)`; la sustitución usa el índice de la
   alternativa (`alt:0`, `alt:1`, `alt:2`). Si se añade otro sitio con "varios candidatos para el
   mismo hueco", aplicar el mismo patrón (clave explícita, nunca derivada de day/meal).
3. **El bucle de reintento de la sustitución gastaba una llamada de más intentando arreglar algo
   que no podía**: `validateWeekDraft` revalida la semana entera (los otros 13 huecos + el
   candidato), así que puede devolver una violación de un día distinto al que se está sustituyendo
   — cambiar la cena del lunes no arregla que la del viernes ya repitiera algo del cole antes de
   esta llamada. `server/pipeline/substitute.ts` ahora filtra con `isRelevantViolation()`: solo
   cuentan las violaciones de máximos/mínimos semanales (esas sí las afecta el candidato, se cuentan
   sobre las 14 raciones) o las del propio día/comida sustituido — el resto ni dispara reintento ni
   contamina la respuesta.

Además, `server/clients/{gemini,tavily}.ts` reintentan automáticamente (hasta 3 veces, con backoff)
solo 429/5xx — el nivel gratuito de Gemini tiene un límite de peticiones por minuto bastante bajo,
comprobado de verdad: una llamada aislada puede fallar con 429 sin que haya nada mal en ella. Un
400/401/403 no se arregla reintentando, así que esos se siguen propagando al momento.

**Conectado el frontend, se repitió la misma disciplina — probado con clics reales en un navegador
(CDP), no solo `curl`, con las claves reales puestas**: generar con "Probar con un menú de ejemplo"
→ contar que salen exactamente 14 botones "Cambiar" (uno por hueco: comida+cena de los 7 días) →
abrir uno, esperar las alternativas reales, elegir una → "Confirmar planificación" → aparece de
verdad en `/guardados` con una URL real (`/semana/<uuid>`) → abrirla y comprobar que es de solo
lectura (0 "Cambiar") y que el plato sustituido antes de confirmar es el que quedó guardado.

## Convenciones y detalles que importan

- **Estilo de código muy comprimido**: cada `page.tsx` y cada componente de `components/menu/`
  meten un componente entero en una línea. Al editar, mantener ese estilo o el diff se vuelve
  ilegible. Sin punto y coma, comillas simples.
- **Idioma**: toda la UI está en español. `<html lang="es">`.
- **Color de marca**: `emerald-600` para acentos, fondo `#f5f8f6`. Los tokens shadcn de
  `globals.css` son los neutros por defecto y casi no se usan — el diseño va con clases Tailwind
  directas (`emerald-*`, `slate-*`).
- **Sin modo oscuro, a petición explícita ("siempre quiero que se muestre igual").** La app nunca
  cambia con `prefers-color-scheme`, aunque el sistema esté en oscuro (comprobado forzando
  `prefers-color-scheme: dark` por CDP con `Emulation.setEmulatedMedia`). Cómo queda montado:
  - `globals.css` ya **no tiene** ni la clase `.dark { ... }` ni el bloque
    `@media (prefers-color-scheme: dark) { :root:not(.light) {...} }` que hacía que las variables
    (`--background`, `--foreground`, etc.) cambiaran solas con el sistema. Solo queda el `:root`
    claro.
  - **Pero `@custom-variant dark (&:is(.dark *));` se mantiene a propósito** — no es un descuido.
    Varios primitivos de `components/ui/` (`button.tsx`, `badge.tsx`, `tabs.tsx`) ya traen clases
    `dark:...` de fábrica (de cuando se generaron con shadcn). Esa línea redefine `dark:` para que
    dependa de una clase `.dark` que esta app nunca añade a ningún elemento; sin ella, Tailwind v4
    usa su propio `dark:` por defecto (`@media (prefers-color-scheme: dark)`), y esas clases
    `dark:...` que ya existen en los primitivos volverían a reaccionar al sistema. **Si algún día
    se "limpia" esa línea creyendo que ya no hace falta, el modo oscuro vuelve por la puerta de
    atrás.**
  - `app/layout.tsx`: `viewport.colorScheme` es `'light'` (no `'light dark'`) y `themeColor` es un
    único `'white'` (no un array por media query). El icono también es uno solo
    (`icon-light-32x32.png` + el SVG); `public/icon-dark-32x32.png` se quedó sin usar en el repo,
    no hace falta borrarlo pero tampoco referenciarlo desde ningún sitio nuevo. **El favicon es el
    logo de la cabecera** (a petición): `public/icon.svg` reproduce `AppHeader` con los paths de
    `Utensils` de lucide, cuadrado de 36 con `rx=12` y `#009966` (= `emerald-600` de Tailwind v4,
    que se define en oklch). `icon-light-32x32.png` y `apple-icon.png` (180, cuadrado entero
    sin esquinas porque iOS pone su máscara) se renderizaron desde ese SVG con Chrome headless. Si
    cambia el logo de la cabecera, regenerar los tres.
- **Impresión**: `globals.css` tiene un `@media print` cuidado (A4, oculta tabs y botones, evita
  cortes con `break-inside: avoid`). `PrintMenu` es `hidden print:block` — es la versión que se
  imprime, distinta de las tarjetas de pantalla. Si cambias una, cambia la otra.
- **Inconsistencia conocida**: las primitivas importan `cn` desde el paquete npm `"cn"`, excepto
  `button.tsx` que lo importa de `'@/lib/utils'`. Ambas funcionan; `@/lib/utils` es lo correcto.
- **`@base-ui/react` no usa las convenciones de Radix.** Dos casos ya pillados en este proyecto:
  - No existe `asChild`: para fundir un componente hijo con un trigger/close hay que pasar
    `render={<Componente />}`, p. ej. `<DrawerClose render={<Button variant="outline">Cancelar</Button>} />`.
    `asChild` no siempre da error de tipos, pero la prop se ignora en runtime y queda un `<button>`
    anidado dentro de otro.
  - El estado "activo" de un `Tab` no se marca con `data-state="active"` (Radix) sino con la
    presencia del atributo `data-active` (sin valor). Un selector `data-[state=active]:...` en
    Tailwind **no falla, simplemente no coincide nunca**. El selector correcto es `data-active:...`.
    Revisar `grep -rn "data-\[state" app/ components/` si se copia código de ejemplos shadcn/Radix.
    (Esto salió al usar el `Tabs` de base-ui para Planificador/Guardados; ahora esa navegación son
    dos `<Link>` en `TabNav`, sin `Tabs`, así que ya no aplica ahí — pero sigue siendo válido si se
    usa `Tabs`/`Collapsible`/cualquier primitiva de base-ui con estado "activo" en el futuro.)
  - Cuando `render` sustituye el `<button>` por algo que **no** es un botón nativo (p. ej.
    `<Button render={<Link href="...">Ver</Link>} />` para que un botón navegue de verdad), hay que
    añadir `nativeButton={false}`. Si no, Base UI avisa por consola ("expected a native `<button>`
    because the `nativeButton` prop is true...") y trata el elemento con semántica/accesibilidad de
    botón nativo aunque sea un `<a>`. Por defecto `nativeButton` es `true`.
- **`next.config.mjs` tiene `typescript.ignoreBuildErrors: true`** e `images.unoptimized`. El build
  no falla por errores de tipos, así que conviene comprobarlos aparte (`pnpm exec tsc --noEmit`);
  así se detectó el bug de `asChild` de arriba.
- Layout pensado mobile-first, pero el contenido escala a 2–3 columnas en `xl`/`2xl`.
- **`TabNav`**: va **arriba**, justo debajo del `<header>` de cada página (no abajo como una barra
  de app nativa — así era en un diseño anterior; se cambió a petición, y luego Planificador/Guardados
  pasaron de pestañas a páginas de verdad, ver "Rutas"). Visualmente sigue siendo un segmented
  control: pista gris (`bg-slate-100`) con una píldora blanca (`bg-white` + `shadow-sm`) en el enlace
  activo — el estado activo rellena toda la celda para que sea inequívoco, no un simple cambio de
  color de texto. `sticky top-0` para que siga visible al hacer scroll por el menú semanal.
- **El botón "Generar menú semanal inteligente" desbordaba toda la página en móvil estrecho
  (< ~480px, p. ej. iPhone SE a 320–375px)**: `Button` fuerza `whitespace-nowrap` y una altura fija
  (`h-8` de su variante por defecto); ese texto largo en una sola línea no cabía, y como el botón es
  un item dentro del contenedor `flex-col` de `PageShell`, forzaba a TODO el ancho de página
  (cabecera, `TabNav`, tarjetas) a crecer más que el viewport — no era un problema solo del botón.
  Se corrigió pasándole `h-auto min-h-12 whitespace-normal` (deja que el texto envuelva a 2 líneas si
  hace falta) — hay que anular explícitamente `h-8` con `h-auto`, ya que `min-h-12` es una propiedad
  CSS distinta y `twMerge` no las considera en conflicto. Si se añade otro botón/CTA con texto largo
  y `w-full`, revisar lo mismo. **Para comprobar overflow horizontal en móvil, no basta con
  `--headless=new --window-size=W,H --screenshot`** (ese modo no fija el viewport de forma fiable,
  puede dar falsos positivos/negativos); hay que forzar el viewport por CDP
  (`Emulation.setDeviceMetricsOverride`) o revisar `document.documentElement.scrollWidth` en un
  navegador real.
- **Nunca leer un `FileList` (ni `dataTransfer.files`) dentro del updater de un `setState`.** Es un
  objeto vivo: `input.value = ''` lo vacía en el acto, y el `DataTransfer` de un drop se bloquea al
  acabar el evento. React puede ejecutar el updater más tarde (depende de si hay otras
  actualizaciones pendientes), y entonces encuentra la lista vacía. No da ningún error: el archivo
  simplemente no aparece. Pasó de verdad en `/planificador`: el primer PDF entraba y **a partir del
  segundo no salía nada en el cuadrado verde**, reproducido subiendo 3 archivos seguidos por CDP. Por
  eso `addFiles` hace `Array.from(files)` síncrono antes de `setUploaded`, y además ignora un
  archivo que ya está en la lista (mismo `id` = nombre + tamaño + fecha). Un test que solo sube
  UN archivo no lo detecta.
- **Headless Chrome recién arrancado: la pestaña está `visibilityState: 'hidden'` y
  `requestAnimationFrame` no se ejecuta.** Los modales de base-ui (Dialog/Drawer) se quedan para
  siempre en `data-starting-style` (opacidad 0) y parecen rotos, pero no lo están: con la pestaña
  visible (en un navegador real, o tras usarla un rato en el mismo headless) se abren bien.
  Comprobarlo con `requestAnimationFrame` antes de dar un modal por roto. Tampoco hay que hacer
  clic justo al cargar una página: el botón ya está en el HTML del servidor pero no responde hasta
  que React hidrata.
- **Al probar por CDP la subida de archivos (el `<input type="file">` oculto dentro del
  `<label>` "Subir")**: un clic simulado con `Runtime.evaluate` (JS `.click()`) no
  cuenta como gesto de usuario real, así que Chrome no abre el selector de archivos nativo ni emite
  `Page.fileChooserOpened` — parece "roto" pero no lo está. Hay que simular el clic con
  `Input.dispatchMouseEvent` (mousePressed + mouseReleased) sobre las coordenadas reales del botón.

## Qué falta si esto pasa a producción

El circuito completo **funciona de verdad**, probado con claves reales de principio a fin: subir
menús → generar → sustituir un plato → confirmar y guardar →
verlo en Guardados → abrir esa semana guardada de solo lectura. Lo que sigue faltando para un uso
real, no ya de prototipo:

- **Persistencia**: ya resuelta con Supabase (ver "Historial"). Falta solo configurar `DATABASE_URL` en Vercel.
- Autenticación y gestión de familias/niños (hoy es de un único hogar sin usuarios; el historial es
  una única lista global compartida por cualquiera que use la app).
- **UX de subida por niña más pulida.** Hoy cada archivo se asigna a "Aina" por defecto y se
  retoca con dos botones-pastilla dentro del chip (ver "Rutas" arriba) — funciona, pero es la
  mínima UI posible para el contrato del backend (un campo de formulario por niña), no un diseño
  pensado para más de dos hijos o para hacerlo más evidente a la primera.
- **Cuota del nivel gratuito de Gemini.** Con la clave real puesta en este proyecto, probar varias
  veces seguidas (varias generaciones/sustituciones en poco tiempo) puede toparse con el límite de
  peticiones por minuto — los clientes reintentan automáticamente (`server/clients/{gemini,tavily}.ts`),
  pero una sesión de pruebas intensiva igualmente puede tardar más o fallar tras agotar los
  reintentos. No es un bug de la app, es el nivel gratuito de la cuenta (ver "Backend").

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
