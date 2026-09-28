# Backend — planificador de menús (pipeline de IA)

Arquitectura y lógica de backend para generar, sustituir y guardar menús semanales familiares,
usando Gemini (OCR + planificación + estandarización) y Tavily (búsqueda de recetas reales
restringida a un puñado de sitios). Vive en `server/` (lógica) + `app/api/**/route.ts` (HTTP).

Este documento es la referencia técnica de los endpoints (contratos, ejemplos). El resumen de
arquitectura y las decisiones de diseño están en `CLAUDE.md` (sección "Backend").

## Configuración

```bash
cp .env.local.example .env.local
# rellenar GEMINI_API_KEY y TAVILY_API_KEY en .env.local
```

Sin esas dos variables, cualquier endpoint que llame a Gemini o Tavily responde `500
config_error` con un mensaje explicando qué variable falta — no hay claves hardcodeadas en ningún
sitio, ni un fallback silencioso.

**Este proyecto tiene claves reales configuradas y todo el pipeline se ha probado de verdad contra
Gemini y Tavily** (no solo `tsc`/mocks) — ver "Verificado con la API real" más abajo, y el mismo
apartado en `CLAUDE.md`, antes de asumir que algo "seguro que funciona" sin probarlo.

**Sobre el modelo "Pro"**: probado con una clave real de nivel gratuito, ni `gemini-2.5-pro`
(404, retirado) ni el sustituto que sugiere el propio error de Google, `gemini-3.1-pro-preview`
(429, cuota 0 en ese nivel), están disponibles. El default de `GEMINI_MODEL_PRO` es por eso
`gemini-2.5-flash` — el mismo modelo que `GEMINI_MODEL_FLASH` —, no un modelo Pro de verdad. Si la
cuenta tiene acceso a un Pro real, fijarlo por variable de entorno (ver `server/env.ts`).

## El pipeline

```
Paso 1 (Gemini)          Paso 2 (Gemini)              Paso 3 (Tavily)         Paso 4 (Gemini)
extractSchoolMenu   →    planWeek (+ reglas +    →    fetchRecipes       →    selectRecipes
                         reintento si incumple)        (concurrente, hasta     (elige la mejor:
                                                        3 candidatas/plato      web o propia de IA)
                                                        + 1 de Cookidoo)
                                                                                     ↓
                                                                            assembleWeek (JSON final)
```

- **Paso 1** — una llamada a Gemini **por niña** (no una sola llamada mezclando documentos): el
  cliente ya indica de forma fiable a quién pertenece cada archivo, así que no hace falta que
  Gemini además lo adivine.
- **Paso 2** — planifica los 14 "huecos" (comida y cena de los 7 días, **todos**, incluida la
  comida de lunes a viernes: es un plato real para los adultos de la casa, no información del cole
  — ver más abajo). El resultado se valida con un motor de reglas determinista
  (`server/rules/engine.ts`) — nunca nos fiamos de que el LLM cuente bien sus propias raciones. Si
  incumple algo, se reintenta pasándole el detalle exacto de qué falló, hasta 3 veces.
- **Paso 3** — una búsqueda de Tavily por plato, todas en paralelo. Restringida "estrictamente" a
  `cookidoo.es`, `elpais.com/gastronomia/el-comidista`, `directoalpaladar.com`, `cookpad.com`,
  `petitchef.es` — el caso de El Comidista se re-comprueba por ruta además de por dominio, porque
  Tavily solo filtra por dominio y El Comidista no tiene uno propio (vive bajo `elpais.com`).
- **Paso 4** — solo para los platos que sí tuvieron receta real: Gemini estandariza el contenido
  bruto de la web a `{ title, description, ingredients }`. Los que no tuvieron receta se quedan
  como los propuso el Paso 2, marcados como "Generado por IA".

Tanto `server/clients/gemini.ts` como `server/clients/tavily.ts` reintentan automáticamente (hasta
3 veces, con backoff) solo los errores 429/5xx — probado de verdad: el nivel gratuito de Gemini
tiene un límite de peticiones por minuto bastante bajo, y una llamada aislada puede fallar con 429
sin que haya nada mal en la llamada en sí. Un 400 (esquema mal formado) o 401/403 (clave inválida)
no se arregla reintentando, así que esos se propagan al momento.

## Por qué el menú escolar nunca ocupa un hueco

A petición explícita del usuario, el menú del cole/guardería de Aina e Iria no es información que
la app deba mostrar. Su único uso es como contexto: en el Paso 2 (y en la sustitución) para que la
cena de cada día de cole no repita categoría de proteína ni ingredientes con lo que las niñas ya
comieron. `PLANNED_SLOTS` cubre los 14 huecos reales (comida+cena de los 7 días) y el menú escolar
nunca se convierte en un `FinalDish` ni ocupa ninguno de ellos — `assembleWeek`
(`server/pipeline/assemble.ts`) no tiene ninguna rama que lo haga, y `DishSourceKindSchema` ya no
admite un valor `'escolar'` (solo `'ia' | 'web'`). Ver `CLAUDE.md` (sección "Reglas dietéticas y la
comida de lunes a viernes") para el porqué de este diseño frente a una versión anterior.

## Endpoints

Todas las respuestas de error tienen la forma `{ error: { code, message, details? } }`.

### `POST /api/menus/extract` — Paso 1 en solitario

`multipart/form-data`: un campo de formulario **por niña**, con su propio nombre como clave (p.
ej. `Aina`, `Iria`), y uno o varios archivos adjuntos bajo ese campo (PDF, PNG, JPEG o WebP; máx.
15&nbsp;MB cada uno).

```bash
curl -X POST http://localhost:3000/api/menus/extract \
  -F "Aina=@menu-aina-septiembre.pdf" \
  -F "Iria=@menu-guarderia-iria.pdf"
```

Respuesta: `{ schoolMenu: SchoolMenuExtraction }`.

### `POST /api/menus/generate` — Pasos 2-4

Cuando ya se tiene el JSON del menú escolar (de `/extract`, o guardado de antes) y no hace falta
repetir el OCR.

```bash
curl -X POST http://localhost:3000/api/menus/generate \
  -H "Content-Type: application/json" \
  -d '{"schoolMenu": { "children": [...] }, "history": [{"label":"Semana pasada","highlights":["Lentejas con chorizo"]}] }'
```

Respuesta: `{ week: WeekPlan, violations: RuleViolation[] }`. `violations` vacío = la propuesta
cumple todo; si no, es la mejor propuesta tras 3 intentos, con el detalle de qué no se corrigió.

### `POST /api/menus/plan` — pipeline completo (1→4) de una vez

El equivalente directo del botón único "Generar menú semanal inteligente" del frontend.
`multipart/form-data` igual que `/extract`, más un campo de texto opcional `history` con el JSON
de `HistorySummary[]`.

```bash
curl -X POST http://localhost:3000/api/menus/plan \
  -F "Aina=@menu-aina.pdf" -F "Iria=@menu-iria.pdf" \
  -F 'history=[{"label":"Semana pasada","highlights":["Lentejas con chorizo"]}]'
```

Respuesta: `{ schoolMenu, week, violations }`.

### `POST /api/menus/substitute` — sustituir un plato ("Cambiar")

```bash
curl -X POST http://localhost:3000/api/menus/substitute \
  -H "Content-Type: application/json" \
  -d '{"day":"lunes","meal":"cena","currentWeek": { ... }, "schoolMenu": { ... }, "count": 3}'
```

- `schoolMenu` es opcional: sin él no se puede comprobar "no repetir la comida escolar" para ese
  día, pero el resto de reglas (límites semanales) se sigue validando igual.
- `count` (opcional, 1-5, por defecto 3): cuántas alternativas devolver.
- `day`/`meal` puede ser cualquiera de los 14 `PLANNED_SLOTS` (comida+cena de los 7 días) — incluida
  la comida de lunes a viernes, que es un plato real generado por IA como cualquier otro hueco.

Respuesta: `{ alternatives: FinalDish[], violations: RuleViolation[] }`.

### Historial

- `GET /api/history` → `{ entries: HistoryEntry[] }`, más reciente primero.
- `POST /api/history` con `{ label: string, weekStart?: 'YYYY-MM-DD', week: WeekPlan }` → `{ entry: HistoryEntry }` (201).
  Es lo que dispara "Confirmar planificación" en el frontend, una vez conectado.
- `GET /api/history/[id]` → `{ entry: HistoryEntry }` o 404.
- `DELETE /api/history/[id]` → 204 o 404. Borra también las recetas que ya no usa ninguna otra semana.

**Persistencia**: Modelo relacional en `server/db/schema.sql` (DDL de PostgreSQL, hoy no se ejecuta en ningún
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

**Almacenamiento actual**: `server/history/store.ts` guarda esas mismas tablas como filas en un
único JSON, `.data/mesamia-db.json` dentro del proyecto (o `MESAMIA_DATA_DIR`; en Vercel,
`os.tmpdir()`, que es efímero). Escribe de forma atómica (fichero temporal + `rename`) y pone las
escrituras en cola dentro del proceso. Si el JSON está corrupto, falla en vez de tratarlo como
vacío, para que el siguiente guardado no borre el histórico. **Para pasar a una BD real**: ejecutar
`schema.sql` e implementar `HistoryStore` con SQL; las rutas y el frontend no cambian.

## Motor de reglas (`server/rules/`)

Determinista, no delega en el LLM. Cuenta las categorías de proteína (`huevo`, `ave`, `pescado`,
`carne_roja`, `legumbre`, `otro` — interpretación concreta de "tipología del plato" del enunciado)
sobre los 14 huecos generados, incluida la comida de lunes a viernes. El menú escolar de las niñas
nunca entra en el recuento — no es una propuesta que se valide, solo contexto para la regla de
"no repetir en la cena". El solapamiento de
ingredientes cena-vs-cole es una heurística de texto (normaliza acentos/mayúsculas, compara por
igualdad o contención), no NLP real — ver comentarios en `engine.ts`.

Además, `restrictions.ts` aplica las restricciones de la familia en cada plato: sin marisco
(pota/calamar/pulpo/sepia sí), sin atún, sin aceitunas, sin champiñones ni tofu, y como único pescado merluza o salmón. De
lunes a viernes, las recetas tienen que ser fáciles y de ≤ 50 min (`totalTimeMinutes`,
`difficulty`). Se comprueban tanto sobre el plato planificado como sobre la receta web consolidada
(Paso 4); una receta web que incumpla algo se descarta y el plato se queda como "Generado por IA".

## Verificado con la API real (no solo mocks)

Con las claves reales puestas, se ha ejecutado de verdad (no solo `tsc`/errores simulados):

- `generateStructured` (Gemini, Flash) y `searchRecipeCandidates` (Tavily) por separado — ambos responden
  correctamente; Tavily encontró y clasificó bien un resultado real de El Comidista (el caso del
  dominio compartido con ruta específica).
- `POST /api/menus/generate` completo con un menú escolar sintético de una niña: la semana
  resultante cumplió las 5 reglas (repetición cena/cole por día, máx. huevo/ave/pescado/carne roja,
  mín. legumbres) sin necesitar reintento, con recetas reales de Cookpad, El Comidista y Directo al
  Paladar.
- `POST /api/menus/substitute`, dos veces (antes y después de arreglar el bug de abajo).

**Dos bugs reales encontrados y corregidos gracias a esta prueba** (ninguno lo detectaba `tsc` ni
los tests con datos sintéticos de la sesión anterior, porque ambos solo aparecen cuando hay más de
un candidato para el mismo hueco — algo que solo pasa en `/substitute`, no en la generación de una
semana completa):

1. **Las 3 alternativas de `/substitute` salían con el mismo título/receta.** `dishFromPlannedSlot`
   y el mapa del Paso 4 (hoy `selectRecipes`) se indexaban por `slotKey(day, meal)` — válido para una semana
   completa (cada combinación día+comida aparece una sola vez), pero las N alternativas de UN
   mismo hueco comparten día y comida, así que todas colisionaban en la misma clave y se
   sobrescribían entre sí. Arreglado pasando la clave explícitamente desde el llamador (`key:
   string` en vez de derivarla de day/meal) — la generación de semana completa sigue usando
   `slotKey(day, meal)`, la sustitución usa el índice de la alternativa (`alt:0`, `alt:1`...).
2. **El bucle de reintento de `/substitute` gastaba una llamada de más intentando arreglar algo que
   no podía.** `validateWeekDraft` revalida la semana entera (los otros 13 huecos + el candidato), y
   puede devolver una violación de un día distinto al que se está sustituyendo — cambiar el hueco
   de hoy no arregla algo mal en otro día. Sin filtrar esto, esa violación ajena nunca desaparecía
   (reintento inútil) y además contaminaba la respuesta dando a entender que la sustitución en sí
   había fallado. Arreglado: solo cuentan las violaciones de máximos/mínimos semanales (esas sí las
   afecta el candidato) o las del propio día/comida que se está sustituyendo.

## Limitaciones conocidas / siguientes pasos

- **El frontend ya está conectado** (`lib/api.ts`, `app/planificador`, `app/guardados`,
  `components/menu/week-view.tsx`) — "Generar" llama a `/api/menus/plan`, "Cambiar" a
  `/api/menus/substitute`, "Confirmar planificación" a `POST /api/history`, y `/semana/[slug]` lee
  `historyStore` directamente (mismo proceso, sin HTTP de por medio). Detalle de cómo, en `CLAUDE.md`.
- Sin autenticación ni multi-familia: es de un solo hogar. Añadir usuarios implicaría namespacing
  del historial (hoy es una única lista global en el fichero de `HistoryStore`).
- Los reintentos (Paso 2: hasta 3; sustitución: hasta 2) acotan coste/latencia, pero no garantizan
  el 100% de las veces cero violaciones — por diseño se devuelve la mejor propuesta encontrada con
  `violations` explícitas en vez de fallar la petición entera.
