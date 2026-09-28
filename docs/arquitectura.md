# Arquitectura de MesaMía

Cuatro diagramas, de lo general a lo concreto. Reflejan el código a 28 de septiembre de 2026; si
cambia el pipeline, las rutas o el modelo de datos, actualízalos aquí. Los detalles de cada pieza
están en `CLAUDE.md` y `server/README.md`.

Dos ideas para leerlos:

- **Reglas obligatorias frente a orientación.** Las obligatorias las comprueba siempre el código
  (`server/rules/`): límites semanales de proteína, ingredientes prohibidos, recetas fáciles y de
  ≤ 50 min de lunes a viernes, y que la cena no repita lo del cole. Lo que es orientación lo decide
  la IA: que la comida se parezca a la de Aina, inspirarse en la "proposta de sopar" y adaptarse a
  los gustos del historial.
- **El historial de gustos no se guarda aparte.** Se calcula en el momento a partir de las semanas
  guardadas: cada `week_meals` sabe si la familia aceptó la propuesta de la IA o la cambió, y por
  qué plato.

## 1. Arquitectura general

```mermaid
flowchart LR
  subgraph NAV["Navegador"]
    P["/planificador<br/>subir menús · elegir semana · generar<br/>cambiar platos · confirmar"]
    G["/guardados<br/>lista · ver · borrar"]
    C["lib/api.ts<br/>cliente HTTP"]
    P --> C
    G --> C
  end

  subgraph SRV["Servidor Next.js"]
    SEM["/semana/[slug]<br/>Server Component, solo lectura"]
    R0["POST /api/menus/extract<br/>solo Paso 1 · no lo usa la UI"]
    R1["POST /api/menus/plan<br/>archivos + weekStart → semana"]
    R2["POST /api/menus/generate<br/>menú JSON + weekStart → semana"]
    R3["POST /api/menus/substitute<br/>3 alternativas para 1 hueco"]
    R4["/api/history<br/>GET · POST · GET id · DELETE id"]
    R5["GET /api/history/context<br/>lo que verá la IA del historial"]
    PIPE["server/pipeline<br/>orchestrator · substitute"]
    CTX["Contexto para el LLM<br/>schoolContext: menú de Aina e Iria<br/>taste-context: 3 semanas anteriores"]
    RULES["server/rules<br/>engine + restrictions<br/>código determinista"]
    STORE["server/history/store.ts<br/>interfaz HistoryStore"]
  end

  subgraph EXT["Servicios externos"]
    GEM["Gemini<br/>extraer · planificar · elegir receta"]
    TAV["Tavily<br/>5 webs de recetas + búsqueda aparte en Cookidoo"]
  end

  DB[("JSON local<br/>.data/mesamia-db.json")]
  PG[("PostgreSQL<br/>próxima iteración")]

  C --> R1 & R2 & R3 & R4 & R5
  R0 & R1 & R2 & R3 --> PIPE
  R1 & R2 & R3 & R5 --> CTX
  CTX --> STORE
  CTX --> PIPE
  PIPE --> RULES
  PIPE --> GEM
  PIPE --> TAV
  R4 --> STORE
  SEM --> STORE
  STORE --> DB
  STORE -. "misma interfaz" .-> PG
```

## 2. Pipeline de generación de la semana (`POST /api/menus/plan`)

```mermaid
flowchart TD
  IN["PDF / imágenes<br/>un campo por niña: Aina, Iria<br/>+ weekStart"] --> S1["Paso 1 · Extracción<br/>Gemini Flash · 1 llamada por niña<br/>comida de cada día + proposta de sopar<br/>+ fechas del menú · elige la semana en un menú mensual"]
  S1 --> SM[("Menú escolar por día<br/>nunca se muestra en la app")]
  HIST[("Historial de gustos<br/>3 semanas guardadas anteriores<br/>aceptado · cambiado · escrito a mano")]

  SM -- "comida adultos ≈ la de Aina<br/>cena inspirada en su proposta<br/>cena ≠ lo que comieron en el cole" --> S2
  HIST -- "adaptarse a lo que<br/>aceptan y cambian" --> S2

  S2["Paso 2 · Planificación<br/>Gemini · 14 huecos<br/>comida + cena × 7 días"] --> V{"Motor de reglas<br/>límites de proteína · ingredientes prohibidos<br/>fácil y ≤ 50 min L-V · cena ≠ cole"}
  V -- "incumple · reintento con el detalle<br/>máx. 3 intentos" --> S2
  V -- "cumple" --> S3

  subgraph S3["Paso 3 · Candidatas · Tavily, los 14 platos en paralelo"]
    T1["Búsqueda general advanced<br/>5 webs · hasta 3 candidatas<br/>solo páginas de UNA receta, ≥ 800 caracteres"]
    T2["Búsqueda basic solo en Cookidoo<br/>→ 1 URL por plato"]
    T3["1 extract con todas las URLs<br/>de Cookidoo de la semana"]
    T2 --> T3
  end

  S3 --> S4["Paso 4 · Elección<br/>Gemini Flash · 1 llamada por plato<br/>hasta 4 candidatas web frente a su propia receta<br/>sabe que hay Thermomix + Cookidoo"]
  S4 --> R{"Restricciones sobre<br/>la receta elegida"}
  R -- "cumple" --> OK["Receta web o Generado por IA<br/>ingredientes · pasos · tiempo · dificultad<br/>Cookidoo: sin pasos, enlace a la receta"]
  R -- "incumple o falla" --> FB["Plato tal cual lo planificó el Paso 2"]
  OK & FB --> S5["Paso 5 · Ensamblado<br/>WeekPlan de 7 días"]
  S5 --> OUT["Respuesta al navegador"]
```

`POST /api/menus/generate` hace lo mismo sin el Paso 1. `POST /api/menus/substitute` repite los
pasos 2 a 4 para un solo hueco y devuelve 3 alternativas, con 2 intentos como máximo. También recibe
el historial y el menú escolar de ese día.

## 3. Recorrido del usuario

```mermaid
sequenceDiagram
  actor U as Usuario
  participant P as /planificador
  participant API as API Next.js
  participant IA as Gemini + Tavily
  participant BD as HistoryStore

  U->>P: Elige semana (por defecto la que viene)
  P->>API: GET /api/history/context?weekStart
  API->>BD: 3 semanas guardadas anteriores
  API-->>P: Qué semanas tendrá en cuenta la IA
  U->>P: Sube menús y pulsa Generar
  P->>API: POST /api/menus/plan (archivos + weekStart)
  Note over P: Barra de progreso ~1,9 min<br/>no pasa del 99% hasta que responde
  API->>BD: Historial de gustos
  API->>IA: Pasos 1-4 con menú escolar + historial
  IA-->>API: 14 platos validados
  API-->>P: WeekPlan + menú escolar con sus fechas
  Note over P: Si las fechas del menú del cole no caen<br/>en la semana elegida, aviso en pantalla
  U->>P: Cambiar un plato
  Note over P: Abre el modal, sin llamadas todavía
  alt Buscar alternativas
    P->>API: POST /api/menus/substitute (+ weekStart)
    API->>IA: Pasos 2-4 para 1 hueco con historial y menú del día
    API-->>P: 3 alternativas
  else Escribe su propio plato
    Note over P: Solo en el cliente, sin backend
  end
  U->>P: Confirmar y guardar
  Note over P: Compara con la propuesta original<br/>qué cambió y cómo
  P->>API: POST /api/history (semana + cambios)
  API->>BD: save()
  P->>P: Navega a /guardados
  U->>BD: Ver una semana: /semana/[id] la lee directamente
  U->>API: Borrar: DELETE /api/history/[id]
  API->>BD: remove() + recetas que quedan sin uso
```

## 4. Modelo de datos (histórico de Guardados)

El esquema completo, con tipos y restricciones, está en `server/db/schema.sql`.

```mermaid
erDiagram
  saved_weeks ||--o{ week_meals : "14 huecos"
  recipes ||--o{ week_meals : "usada en"
  recipes ||--o{ recipe_ingredients : "tiene"
  recipes ||--o{ recipe_steps : "tiene"

  saved_weeks {
    uuid id PK
    text label
    date week_start
    timestamptz generated_at
    timestamptz created_at
  }
  week_meals {
    uuid week_id FK
    day_name day
    meal_slot meal
    uuid recipe_id FK
    text proposed_title "lo que propuso la IA si se cambió"
    meal_change_kind change_kind "alternativa o manual"
  }
  recipes {
    uuid id PK
    text fingerprint UK
    text title
    protein_category protein_category
    text source_name
    text source_url
    int total_time_minutes
    recipe_difficulty difficulty
  }
  recipe_ingredients {
    uuid recipe_id FK
    int position
    text name
  }
  recipe_steps {
    uuid recipe_id FK
    int position
    text text
  }
```
