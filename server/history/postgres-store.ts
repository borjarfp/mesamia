import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { DAY_NAMES, type FinalDayPlan, type FinalDish, type HistoryEntry, type MealChange, type MealSlot, type ShoppingList, type WeekPlan } from '../types'
import { recipeFingerprint } from '../db/tables'
import type { HistoryStore } from './store'

// Implementación de HistoryStore sobre Postgres (Supabase), con las tablas de server/db/schema.sql.
// Se conecta con DATABASE_URL (pooler transaccional de Supabase, puerto 6543). El pool es un
// singleton por proceso; `max` bajo porque en serverless cada instancia abre el suyo.
// DATABASE_URL (la nuestra) o POSTGRES_URL (la que inyecta la integración Supabase↔Vercel).
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL

let pool: Pool | undefined
function getPool(): Pool {
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

async function inTransaction<T>(task: (client: PoolClient) => Promise<T>): Promise<T> {
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

// La columna shopping_list se añadió después de crear las tablas (pnpm db:migrate solo vale para una
// BD vacía), así que se asegura aquí, una vez por proceso. Es idempotente.
let shoppingColumn: Promise<unknown> | undefined
const ensureShoppingColumn = () => shoppingColumn ??= getPool().query('ALTER TABLE saved_weeks ADD COLUMN IF NOT EXISTS shopping_list jsonb').catch(error => { shoppingColumn = undefined; throw error })

export function createPostgresHistoryStore(): HistoryStore {
  return {
    async list() {
      await ensureShoppingColumn()
      const { rows } = await getPool().query<WeekRecord>(`SELECT ${WEEK_COLUMNS} FROM saved_weeks ORDER BY created_at DESC`)
      return loadEntries(rows)
    },
    async get(id) {
      if (!UUID.test(id)) return null
      await ensureShoppingColumn()
      const { rows } = await getPool().query<WeekRecord>(`SELECT ${WEEK_COLUMNS} FROM saved_weeks WHERE id = $1`, [id])
      return (await loadEntries(rows))[0] ?? null
    },
    async save(label, week: WeekPlan, weekStart, changes = []) {
      const weekId = randomUUID()
      await inTransaction(async client => {
        await client.query('INSERT INTO saved_weeks (id, label, week_start, generated_at) VALUES ($1, $2, $3, $4)', [weekId, label, weekStart ?? null, week.generatedAt])
        for (const day of week.days) {
          for (const meal of ['comida', 'cena'] as const) {
            const change = changes.find(item => item.day === day.day && item.meal === meal)
            await client.query('INSERT INTO week_meals (week_id, day, meal, recipe_id, proposed_title, change_kind) VALUES ($1, $2, $3, $4, $5, $6)', [weekId, day.day, meal, await upsertRecipe(client, day[meal]), change?.proposedTitle ?? null, change?.kind ?? null])
          }
        }
      })
      return (await this.get(weekId))!
    },
    async setShoppingList(id, list) {
      if (!UUID.test(id)) return false
      await ensureShoppingColumn()
      const { rowCount } = await getPool().query('UPDATE saved_weeks SET shopping_list = $2::jsonb WHERE id = $1', [id, JSON.stringify(list)])
      return !!rowCount
    },
    async remove(id) {
      if (!UUID.test(id)) return false
      return inTransaction(async client => {
        const { rowCount } = await client.query('DELETE FROM saved_weeks WHERE id = $1', [id])
        if (!rowCount) return false
        // Recetas que ninguna otra semana usa (sus ingredientes y pasos caen por CASCADE).
        await client.query('DELETE FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM week_meals m WHERE m.recipe_id = r.id)')
        return true
      })
    },
  }
}
