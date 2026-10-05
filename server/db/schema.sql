-- Modelo relacional del histórico de Guardados (PostgreSQL).
--
-- Se ejecuta en Supabase (Postgres) y lo usa server/history/postgres-store.ts cuando hay
-- DATABASE_URL. Sin ella, server/history/store.ts guarda las mismas tablas en un JSON local.
-- Aplicar con: pnpm db:migrate
--
--   saved_weeks 1 ──< week_meals >── 1 recipes 1 ──< recipe_ingredients
--                                              1 ──< recipe_steps
--
-- Una semana guardada tiene 14 week_meals (comida + cena × 7 días); cada uno apunta a una receta.
-- Las recetas son un catálogo propio, compartido entre semanas: si dos semanas guardan exactamente
-- el mismo plato (mismo contenido), apuntan a la misma fila de recipes.

CREATE TYPE day_name AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');
CREATE TYPE meal_slot AS ENUM ('comida', 'cena');
CREATE TYPE protein_category AS ENUM ('huevo', 'ave', 'pescado', 'carne_roja', 'legumbre', 'otro');
CREATE TYPE dish_source_kind AS ENUM ('ia', 'web');
CREATE TYPE recipe_difficulty AS ENUM ('facil', 'media', 'dificil');
CREATE TYPE meal_change_kind AS ENUM ('alternativa', 'manual');

-- Una semana confirmada con "Confirmar planificación".
CREATE TABLE saved_weeks (
  id            uuid        PRIMARY KEY,
  label         text        NOT NULL,              -- "5 — 11 octubre", tal como se mostró al guardar
  week_start    date,                              -- lunes de la semana planificada (NULL en guardados antiguos)
  generated_at  timestamptz NOT NULL,              -- cuándo generó la IA la propuesta
  created_at    timestamptz NOT NULL DEFAULT now(), -- cuándo se confirmó/guardó
  shopping_list jsonb                              -- lista de la compra (ShoppingList); NULL hasta que se genera
);
CREATE INDEX saved_weeks_created_at_idx ON saved_weeks (created_at DESC);
CREATE INDEX saved_weeks_week_start_idx ON saved_weeks (week_start);

-- Catálogo de recetas que han aparecido en alguna semana guardada.
-- Inmutables y direccionadas por contenido: `fingerprint` es un hash de todo su contenido
-- (título, descripción, ingredientes, proteína, fuente). Guardar un plato idéntico reutiliza la
-- fila; cualquier diferencia crea una receta nueva — así una semana antigua nunca cambia porque se
-- guarde otra después.
CREATE TABLE recipes (
  id                uuid             PRIMARY KEY,
  fingerprint       text             NOT NULL UNIQUE,
  title             text             NOT NULL,
  description       text             NOT NULL DEFAULT '',
  protein_category  protein_category NOT NULL,
  source_kind       dish_source_kind NOT NULL,
  source_name       text             NOT NULL,     -- 'Generado por IA' | 'Cookidoo' | … | 'Manual'
  source_url        text,                          -- solo recetas web
  total_time_minutes integer          CHECK (total_time_minutes >= 0), -- NULL: plato manual o guardado antiguo
  difficulty        recipe_difficulty,             -- NULL: plato manual o guardado antiguo
  created_at        timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX recipes_source_name_idx ON recipes (source_name);
CREATE INDEX recipes_protein_category_idx ON recipes (protein_category);

-- Ingredientes de cada receta, en orden. Texto libre ("200 g de garbanzos"), no un catálogo de
-- ingredientes: el backend no los normaliza a cantidades/unidades.
CREATE TABLE recipe_ingredients (
  recipe_id  uuid    NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position >= 0),
  name       text    NOT NULL,
  PRIMARY KEY (recipe_id, position)
);

-- Pasos de "cómo se hace" de cada receta, en orden (3-6 frases breves). Una receta sin pasos
-- (plato manual, o guardado antes de existir esta tabla) simplemente no tiene filas aquí.
CREATE TABLE recipe_steps (
  recipe_id  uuid    NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position >= 0),
  text       text    NOT NULL,
  PRIMARY KEY (recipe_id, position)
);

-- Qué receta ocupa cada hueco (día + comida/cena) de una semana guardada, y si la familia la cambió
-- antes de confirmar: `proposed_title` es lo que había propuesto la IA y `change_kind` cómo se
-- sustituyó (una alternativa sugerida, o un plato escrito a mano). Ambos NULL = propuesta aceptada
-- tal cual. Es lo que usa server/history/taste-context.ts para que la IA aprenda sus gustos.
-- Borrar una semana borra sus huecos (CASCADE). Además, la app borra en la misma transacción las
-- recetas que se quedan sin usar (ninguna otra semana las usa), con sus ingredientes y pasos:
--   DELETE FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM week_meals m WHERE m.recipe_id = r.id);
-- Una receta que todavía usa alguna semana no se puede borrar (RESTRICT).
CREATE TABLE week_meals (
  week_id    uuid      NOT NULL REFERENCES saved_weeks (id) ON DELETE CASCADE,
  day        day_name  NOT NULL,
  meal       meal_slot NOT NULL,
  recipe_id  uuid      NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  proposed_title text,
  change_kind    meal_change_kind,
  CHECK ((proposed_title IS NULL) = (change_kind IS NULL)),
  PRIMARY KEY (week_id, day, meal)
);
CREATE INDEX week_meals_recipe_id_idx ON week_meals (recipe_id);

-- Supabase expone el esquema `public` por PostgREST con la clave anon (que va en el cliente). La app
-- accede solo desde el servidor con la conexión Postgres directa (rol postgres, que se salta RLS),
-- así que se activa RLS SIN políticas: la clave anon no puede leer ni escribir nada.
ALTER TABLE saved_weeks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_meals         ENABLE ROW LEVEL SECURITY;
