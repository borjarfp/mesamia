import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DAY_NAMES, type FinalDayPlan, type FinalDish, type HistoryEntry, type MealChange, type MealSlot, type WeekPlan } from '../types'
import { emptyDatabase, LocalDatabaseSchema, recipeFingerprint, type LocalDatabase, type RecipeRow, type WeekMealRow } from '../db/tables'

// Interfaz de persistencia del historial — deliberadamente pequeña e independiente de dónde vivan
// los datos, para poder sustituir la implementación de abajo por una base de datos real (Postgres,
// Supabase...) sin tocar ni las rutas ni el resto del pipeline.
export interface HistoryStore {
  list(): Promise<HistoryEntry[]>
  get(id: string): Promise<HistoryEntry | null>
  save(label: string, week: WeekPlan, weekStart?: string, changes?: MealChange[]): Promise<HistoryEntry>
  remove(id: string): Promise<boolean>
}

// Implementación local: las tablas relacionales de server/db/schema.sql (saved_weeks, recipes,
// recipe_ingredients, recipe_steps, week_meals) guardadas como filas en un único JSON. Mismo modelo que tendrá la
// BD real — esto solo cambia DÓNDE se guardan las filas, no su forma.
//
// Ubicación: MESAMIA_DATA_DIR si está fijada; si no, `.data/` dentro del proyecto (persiste entre
// reinicios en local). En Vercel el filesystem del despliegue es de solo lectura salvo /tmp, así
// que allí se usa os.tmpdir() — que en serverless es efímero: esto NO es persistencia de producción.
const DATA_DIR = process.env.MESAMIA_DATA_DIR ?? (process.env.VERCEL ? tmpdir() : join(process.cwd(), '.data'))
const DATA_FILE = join(DATA_DIR, 'mesamia-db.json')

async function load(): Promise<LocalDatabase> {
  try {
    return LocalDatabaseSchema.parse(JSON.parse(await readFile(DATA_FILE, 'utf-8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDatabase()
    // Un fichero corrupto NO se trata como vacío: el siguiente guardado lo sobrescribiría y se
    // perdería todo el histórico. Mejor fallar y que se vea.
    throw new Error(`No se ha podido leer la base de datos local (${DATA_FILE}): ${(error as Error).message}`)
  }
}

// Escritura atómica (fichero temporal + rename): un proceso que muere a mitad no deja el JSON a medias.
async function persist(db: LocalDatabase): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const tmpFile = `${DATA_FILE}.${randomUUID()}.tmp`
  await writeFile(tmpFile, JSON.stringify(db, null, 2), 'utf-8')
  await rename(tmpFile, DATA_FILE)
}

// Las operaciones se encadenan una detrás de otra: dos guardados simultáneos leerían el mismo
// fichero y el segundo pisaría al primero. (Una BD real lo resuelve con transacciones.)
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

// --- filas → HistoryEntry (lo que hará un JOIN en la BD real) ---------------------------------

function dishFromRow(db: LocalDatabase, recipe: RecipeRow): FinalDish {
  const ingredients = db.recipe_ingredients.filter(row => row.recipe_id === recipe.id).sort((a, b) => a.position - b.position).map(row => row.name)
  const steps = db.recipe_steps.filter(row => row.recipe_id === recipe.id).sort((a, b) => a.position - b.position).map(row => row.text)
  return {
    title: recipe.title,
    description: recipe.description,
    ingredients,
    proteinCategory: recipe.protein_category,
    sourceKind: recipe.source_kind,
    sourceName: recipe.source_name,
    ...(recipe.source_url ? { sourceUrl: recipe.source_url } : {}),
    ...(recipe.total_time_minutes !== null ? { totalTimeMinutes: recipe.total_time_minutes } : {}),
    ...(recipe.difficulty ? { difficulty: recipe.difficulty } : {}),
    ...(steps.length > 0 ? { steps } : {}),
  }
}

function entryFromRows(db: LocalDatabase, weekId: string): HistoryEntry | null {
  const week = db.saved_weeks.find(row => row.id === weekId)
  if (!week) return null
  const recipesById = new Map(db.recipes.map(row => [row.id, row]))
  const meals = db.week_meals.filter(row => row.week_id === weekId)
  const dishAt = (day: string, meal: MealSlot) => {
    const recipe = recipesById.get(meals.find(row => row.day === day && row.meal === meal)?.recipe_id ?? '')
    return recipe ? dishFromRow(db, recipe) : null
  }
  const days: FinalDayPlan[] = DAY_NAMES.flatMap(day => {
    const comida = dishAt(day, 'comida')
    const cena = dishAt(day, 'cena')
    return comida && cena ? [{ day, comida, cena }] : []
  })
  const changes: MealChange[] = DAY_NAMES.flatMap(day => (['comida', 'cena'] as const).flatMap(meal => {
    const row = meals.find(item => item.day === day && item.meal === meal)
    return row?.proposed_title && row.change_kind ? [{ day, meal, proposedTitle: row.proposed_title, kind: row.change_kind }] : []
  }))
  return { id: week.id, label: week.label, createdAt: week.created_at, ...(week.week_start ? { weekStart: week.week_start } : {}), week: { days, generatedAt: week.generated_at }, changes }
}

// --- HistoryEntry → filas -----------------------------------------------------------------------

// Devuelve el id de la receta, reutilizando la fila si ya existe una con el mismo contenido.
function upsertRecipe(db: LocalDatabase, dish: FinalDish, now: string): string {
  const fingerprint = recipeFingerprint(dish)
  const existing = db.recipes.find(row => row.fingerprint === fingerprint)
  if (existing) return existing.id
  const id = randomUUID()
  db.recipes.push({ id, fingerprint, title: dish.title, description: dish.description, protein_category: dish.proteinCategory, source_kind: dish.sourceKind, source_name: dish.sourceName, source_url: dish.sourceUrl ?? null, total_time_minutes: dish.totalTimeMinutes ?? null, difficulty: dish.difficulty ?? null, created_at: now })
  dish.ingredients.forEach((name, position) => db.recipe_ingredients.push({ recipe_id: id, position, name }))
  dish.steps?.forEach((text, position) => db.recipe_steps.push({ recipe_id: id, position, text }))
  return id
}

function createLocalRelationalHistoryStore(): HistoryStore {
  return {
    async list() {
      const db = await load()
      return [...db.saved_weeks]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(row => entryFromRows(db, row.id))
        .filter((entry): entry is HistoryEntry => entry !== null)
    },
    async get(id) {
      return entryFromRows(await load(), id)
    },
    save(label, week, weekStart, changes = []) {
      return serialized(async () => {
        const db = await load()
        const now = new Date().toISOString()
        const weekId = randomUUID()
        db.saved_weeks.push({ id: weekId, label, week_start: weekStart ?? null, generated_at: week.generatedAt, created_at: now })
        for (const day of week.days) {
          for (const meal of ['comida', 'cena'] as const) {
            const change = changes.find(item => item.day === day.day && item.meal === meal)
            const row: WeekMealRow = { week_id: weekId, day: day.day, meal, recipe_id: upsertRecipe(db, day[meal], now), proposed_title: change?.proposedTitle ?? null, change_kind: change?.kind ?? null }
            db.week_meals.push(row)
          }
        }
        await persist(db)
        return entryFromRows(db, weekId)!
      })
    },
    remove(id) {
      return serialized(async () => {
        const db = await load()
        if (!db.saved_weeks.some(row => row.id === id)) return false
        // ON DELETE CASCADE de week_meals. Y, a petición ("no quiero tener ese histórico"), también
        // se borran las recetas que usaba esa semana y ya no usa ninguna otra (con sus ingredientes y
        // pasos); las que comparte con otra semana guardada se quedan. Ver schema.sql.
        db.saved_weeks = db.saved_weeks.filter(row => row.id !== id)
        db.week_meals = db.week_meals.filter(row => row.week_id !== id)
        const inUse = new Set(db.week_meals.map(row => row.recipe_id))
        db.recipes = db.recipes.filter(row => inUse.has(row.id))
        db.recipe_ingredients = db.recipe_ingredients.filter(row => inUse.has(row.recipe_id))
        db.recipe_steps = db.recipe_steps.filter(row => inUse.has(row.recipe_id))
        await persist(db)
        return true
      })
    },
  }
}

// Instancia única compartida por todas las rutas (module-level singleton, como el resto de
// clientes de server/clients/*).
export const historyStore: HistoryStore = createLocalRelationalHistoryStore()
