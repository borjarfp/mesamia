import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { getAdminEmail } from '../env'
import { DAY_NAMES, type FinalDayPlan, type FinalDish, type HistoryEntry, type MealChange, type MealSlot, type ShoppingList, type WeekPlan } from '../types'
import { recipeFingerprint } from '../db/tables'
import type { HistoryStore } from './store'

// Implementación de HistoryStore sobre Postgres (Supabase), con las tablas de server/db/schema.sql.
// Se conecta con DATABASE_URL (pooler transaccional de Supabase, puerto 6543). El pool es un
// singleton por proceso; `max` bajo porque en serverless cada instancia abre el suyo.
// DATABASE_URL (la nuestra) o POSTGRES_URL (la que inyecta la integración Supabase↔Vercel).
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL

let pool: Pool | undefined
export function getPool(): Pool {
  // Se quita la query de la URL (sslmode, supa, pgbouncer…): pg interpreta sslmode como verify-full y el certificado del pooler de Supabase no encadena; el SSL se fija abajo.
  pool ??= new Pool({ connectionString: databaseUrl()!.split('?')[0], ssl: { rejectUnauthorized: false }, max: 3 })
  return pool
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type WeekRecord = { id: string; label: string; week_start: string | null; generated_at: Date; created_at: Date; shopping_list: ShoppingList | null }
type MealRecord = { week_id: string; day: FinalDayPlan['day']; meal: MealSlot; proposed_title: string | null; change_kind: 'alternativa' | 'manual' | null; recipe_id: string; title: string; description: string; protein_category: FinalDish['proteinCategory']; source_kind: FinalDish['sourceKind']; source_name: string; source_url: string | null; total_time_minutes: number | null; difficulty: FinalDish['difficulty'] | null }

// Lee las semanas pedidas con sus 14 huecos, recetas, ingredientes y pasos (4 consultas, sin N+1).
async function loadEntries(weeks: WeekRecord[]): Promise<HistoryEntry[]> {
  if (weeks.length === 0) return []
  const db = getPool()
  const ids = weeks.map(week => week.id)
  const { rows: meals } = await db.query<MealRecord>(
    `SELECT m.week_id, m.day, m.meal, m.proposed_title, m.change_kind, r.id AS recipe_id, r.title, r.description, r.protein_category, r.source_kind, r.source_name, r.source_url, r.total_time_minutes, r.difficulty
       FROM week_meals m JOIN recipes r ON r.id = m.recipe_id WHERE m.week_id = ANY($1::uuid[])`, [ids])
  const recipeIds = [...new Set(meals.map(meal => meal.recipe_id))]
  const [{ rows: ingredientRows }, { rows: stepRows }] = await Promise.all([
    db.query<{ recipe_id: string; name: string }>('SELECT recipe_id, name FROM recipe_ingredients WHERE recipe_id = ANY($1::uuid[]) ORDER BY recipe_id, position', [recipeIds]),
    db.query<{ recipe_id: string; text: string }>('SELECT recipe_id, text FROM recipe_steps WHERE recipe_id = ANY($1::uuid[]) ORDER BY recipe_id, position', [recipeIds]),
  ])
  const group = <T extends { recipe_id: string }>(rows: T[], pick: (row: T) => string) => rows.reduce((map, row) => map.set(row.recipe_id, [...(map.get(row.recipe_id) ?? []), pick(row)]), new Map<string, string[]>())
  const ingredients = group(ingredientRows, row => row.name)
  const steps = group(stepRows, row => row.text)
  const dishOf = (meal: MealRecord): FinalDish => ({
    title: meal.title,
    description: meal.description,
    ingredients: ingredients.get(meal.recipe_id) ?? [],
    proteinCategory: meal.protein_category,
    sourceKind: meal.source_kind,
    sourceName: meal.source_name,
    ...(meal.source_url ? { sourceUrl: meal.source_url } : {}),
    ...(meal.total_time_minutes !== null ? { totalTimeMinutes: meal.total_time_minutes } : {}),
    ...(meal.difficulty ? { difficulty: meal.difficulty } : {}),
    ...(steps.get(meal.recipe_id) ? { steps: steps.get(meal.recipe_id)! } : {}),
  })
  return weeks.map(week => {
    const own = meals.filter(meal => meal.week_id === week.id)
    const at = (day: string, slot: MealSlot) => own.find(meal => meal.day === day && meal.meal === slot)
    const days: FinalDayPlan[] = DAY_NAMES.flatMap(day => {
      const comida = at(day, 'comida')
      const cena = at(day, 'cena')
      return comida && cena ? [{ day, comida: dishOf(comida), cena: dishOf(cena) }] : []
    })
    const changes: MealChange[] = own.flatMap(meal => meal.proposed_title && meal.change_kind ? [{ day: meal.day, meal: meal.meal, proposedTitle: meal.proposed_title, kind: meal.change_kind }] : [])
    return { id: week.id, label: week.label, createdAt: week.created_at.toISOString(), ...(week.week_start ? { weekStart: week.week_start } : {}), week: { days, generatedAt: week.generated_at.toISOString() }, changes, ...(week.shopping_list ? { shoppingList: week.shopping_list } : {}) }
  })
}

const WEEK_COLUMNS = 'id, label, week_start::text AS week_start, generated_at, created_at, shopping_list'

// Devuelve el id de la receta, reutilizando la fila si ya existe una con el mismo contenido.
async function upsertRecipe(client: PoolClient, dish: FinalDish): Promise<string> {
  const { rows } = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO recipes (id, fingerprint, title, description, protein_category, source_kind, source_name, source_url, total_time_minutes, difficulty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (fingerprint) DO UPDATE SET fingerprint = EXCLUDED.fingerprint
     RETURNING id, (xmax = 0) AS inserted`,
    [randomUUID(), recipeFingerprint(dish), dish.title, dish.description, dish.proteinCategory, dish.sourceKind, dish.sourceName, dish.sourceUrl ?? null, dish.totalTimeMinutes ?? null, dish.difficulty ?? null])
  const { id, inserted } = rows[0]
  if (inserted) {
    for (const [position, name] of dish.ingredients.entries()) await client.query('INSERT INTO recipe_ingredients (recipe_id, position, name) VALUES ($1, $2, $3)', [id, position, name])
    for (const [position, text] of (dish.steps ?? []).entries()) await client.query('INSERT INTO recipe_steps (recipe_id, position, text) VALUES ($1, $2, $3)', [id, position, text])
  }
  return id
}

export async function inTransaction<T>(task: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await task(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Lo que se añadió después de crear las tablas (pnpm db:migrate solo vale para una BD vacía) se
// asegura aquí, una vez por proceso, y es idempotente (todo IF NOT EXISTS): la columna shopping_list y
// las familias (tablas families/family_members/family_rules + saved_weeks.family_id) y la lista de acceso (allowed_emails). Lo mismo que schema.sql para
// una BD nueva. El lock evita que dos instancias arranquen a la vez creando las mismas tablas.
let schemaReady: Promise<unknown> | undefined
export const ensureSchema = () => schemaReady ??= inTransaction(async client => {
  await client.query('SELECT pg_advisory_xact_lock(727271)')
  await client.query('ALTER TABLE saved_weeks ADD COLUMN IF NOT EXISTS shopping_list jsonb')
  await client.query('CREATE TABLE IF NOT EXISTS families (id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())')
  await client.query('CREATE TABLE IF NOT EXISTS family_members (family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE, email text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (family_id, email))')
  await client.query('CREATE INDEX IF NOT EXISTS family_members_email_idx ON family_members (email)')
  await client.query('CREATE TABLE IF NOT EXISTS family_rules (family_id uuid PRIMARY KEY REFERENCES families (id) ON DELETE CASCADE, rules jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
  await client.query('ALTER TABLE saved_weeks ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES families (id) ON DELETE CASCADE')
  await client.query('CREATE INDEX IF NOT EXISTS saved_weeks_family_id_idx ON saved_weeks (family_id, created_at DESC)')
  await client.query('ALTER TABLE families ENABLE ROW LEVEL SECURITY')
  await client.query('ALTER TABLE family_members ENABLE ROW LEVEL SECURITY')
  await client.query('ALTER TABLE family_rules ENABLE ROW LEVEL SECURITY')
  // Lista de acceso. Solo la PRIMERA vez que se crea se siembra con los correos que ya estaban en alguna familia
  // (quien ya usaba la app no se queda fuera de golpe); después la gestiona el administrador y no se vuelve a
  // sembrar, o se reañadirían los que quite.
  const accessExisted = (await client.query("SELECT to_regclass('allowed_emails') AS t")).rows[0].t !== null
  await client.query("CREATE TABLE IF NOT EXISTS allowed_emails (email text PRIMARY KEY, added_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())")
  // (El administrador no se siembra: ya tiene acceso siempre y saldría duplicado en la lista.)
  if (!accessExisted) await client.query("INSERT INTO allowed_emails (email, added_by) SELECT DISTINCT lower(email), 'migración' FROM family_members WHERE lower(email) <> $1 ON CONFLICT DO NOTHING", [getAdminEmail()])
  await client.query('ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY')
}).catch(error => { schemaReady = undefined; throw error })

export function createPostgresHistoryStore(): HistoryStore {
  return {
    async list(familyId) {
      if (!UUID.test(familyId)) return []
      await ensureSchema()
      const { rows } = await getPool().query<WeekRecord>(`SELECT ${WEEK_COLUMNS} FROM saved_weeks WHERE family_id = $1 ORDER BY created_at DESC`, [familyId])
      return loadEntries(rows)
    },
    async get(familyId, id) {
      if (!UUID.test(id) || !UUID.test(familyId)) return null
      await ensureSchema()
      const { rows } = await getPool().query<WeekRecord>(`SELECT ${WEEK_COLUMNS} FROM saved_weeks WHERE id = $1 AND family_id = $2`, [id, familyId])
      return (await loadEntries(rows))[0] ?? null
    },
    async save(familyId, label, week: WeekPlan, weekStart, changes = []) {
      const weekId = randomUUID()
      await ensureSchema()
      await inTransaction(async client => {
        await client.query('INSERT INTO saved_weeks (id, family_id, label, week_start, generated_at) VALUES ($1, $2, $3, $4, $5)', [weekId, familyId, label, weekStart ?? null, week.generatedAt])
        for (const day of week.days) {
          for (const meal of ['comida', 'cena'] as const) {
            const change = changes.find(item => item.day === day.day && item.meal === meal)
            await client.query('INSERT INTO week_meals (week_id, day, meal, recipe_id, proposed_title, change_kind) VALUES ($1, $2, $3, $4, $5, $6)', [weekId, day.day, meal, await upsertRecipe(client, day[meal]), change?.proposedTitle ?? null, change?.kind ?? null])
          }
        }
      })
      return (await this.get(familyId, weekId))!
    },
    async setShoppingList(familyId, id, list) {
      if (!UUID.test(id) || !UUID.test(familyId)) return false
      await ensureSchema()
      const { rowCount } = await getPool().query('UPDATE saved_weeks SET shopping_list = $3::jsonb WHERE id = $1 AND family_id = $2', [id, familyId, JSON.stringify(list)])
      return !!rowCount
    },
    async remove(familyId, id) {
      if (!UUID.test(id) || !UUID.test(familyId)) return false
      await ensureSchema()
      return inTransaction(async client => {
        const { rowCount } = await client.query('DELETE FROM saved_weeks WHERE id = $1 AND family_id = $2', [id, familyId])
        if (!rowCount) return false
        // Recetas que ninguna otra semana usa (sus ingredientes y pasos caen por CASCADE).
        await client.query('DELETE FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM week_meals m WHERE m.recipe_id = r.id)')
        return true
      })
    },
  }
}
