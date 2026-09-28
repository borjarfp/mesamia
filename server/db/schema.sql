-- Modelo relacional del histórico de Guardados (PostgreSQL).
--
-- Hoy NO se ejecuta contra ninguna base de datos: server/history/store.ts guarda exactamente estas
-- mismas tablas (mismos nombres de tabla y columna) como filas en un JSON local
-- (.data/mesamia-db.json). La siguiente iteración solo tiene que crear este esquema en una BD real
-- e implementar HistoryStore con SQL — ni las rutas ni el frontend cambian.
--
--   saved_weeks 1 ──< week_meals >── 1 recipes 1 ──< recipe_ingredients
--
-- Una semana guardada tiene 14 week_meals (comida + cena × 7 días); cada uno apunta a una receta.
-- Las recetas son un catálogo propio, compartido entre semanas: si dos semanas guardan exactamente
-- el mismo plato (mismo contenido), apuntan a la misma fila de recipes.

CREATE TYPE day_name AS ENUM ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo');
CREATE TYPE meal_slot AS ENUM ('comida', 'cena');
CREATE TYPE protein_category AS ENUM ('huevo', 'ave', 'pescado', 'carne_roja', 'legumbre', 'otro');
CREATE TYPE dish_source_kind AS ENUM ('ia', 'web');
CREATE TYPE recipe_difficulty AS ENUM ('facil', 'media', 'dificil');

-- Una semana confirmada con "Confirmar planificación".
CREATE TABLE saved_weeks (
  id            uuid        PRIMARY KEY,
  label         text        NOT NULL,              -- "5 — 11 octubre", tal como se mostró al guardar
  week_start    date,                              -- lunes de la semana planificada (NULL en guardados antiguos)
  generated_at  timestamptz NOT NULL,              -- cuándo generó la IA la propuesta
  created_at    timestamptz NOT NULL DEFAULT now() -- cuándo se confirmó/guardó
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

-- Qué receta ocupa cada hueco (día + comida/cena) de una semana guardada.
-- Borrar una semana borra sus huecos, pero NO las recetas (siguen en el histórico de recetas);
-- una receta que usa alguna semana no se puede borrar.
CREATE TABLE week_meals (
  week_id    uuid      NOT NULL REFERENCES saved_weeks (id) ON DELETE CASCADE,
  day        day_name  NOT NULL,
  meal       meal_slot NOT NULL,
  recipe_id  uuid      NOT NULL REFERENCES recipes (id) ON DELETE RESTRICT,
  PRIMARY KEY (week_id, day, meal)
);
CREATE INDEX week_meals_recipe_id_idx ON week_meals (recipe_id);
