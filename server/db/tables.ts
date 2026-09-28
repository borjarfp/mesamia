import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DayNameSchema, DifficultySchema, DishSourceKindSchema, MealSlotSchema, ProteinCategorySchema, type FinalDish } from '../types'

// Espejo en TypeScript/zod de las tablas de server/db/schema.sql — mismos nombres de tabla y de
// columna (snake_case), para que pasar del JSON local a una BD real sea cambiar el almacenamiento,
// no el modelo. Si se toca una tabla aquí, tocarla también en schema.sql (y viceversa).

export const SavedWeekRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  generated_at: z.string(),
  created_at: z.string(),
})
export type SavedWeekRow = z.infer<typeof SavedWeekRowSchema>

export const RecipeRowSchema = z.object({
  id: z.string().uuid(),
  fingerprint: z.string(),
  title: z.string(),
  description: z.string(),
  protein_category: ProteinCategorySchema,
  source_kind: DishSourceKindSchema,
  source_name: z.string(),
  source_url: z.string().nullable(),
  // .default(null): filas escritas antes de existir estas columnas no las traen.
  total_time_minutes: z.number().int().min(0).nullable().default(null),
  difficulty: DifficultySchema.nullable().default(null),
  created_at: z.string(),
})
export type RecipeRow = z.infer<typeof RecipeRowSchema>

export const RecipeIngredientRowSchema = z.object({
  recipe_id: z.string().uuid(),
  position: z.number().int().min(0),
  name: z.string(),
})
export type RecipeIngredientRow = z.infer<typeof RecipeIngredientRowSchema>

export const RecipeStepRowSchema = z.object({
  recipe_id: z.string().uuid(),
  position: z.number().int().min(0),
  text: z.string(),
})
export type RecipeStepRow = z.infer<typeof RecipeStepRowSchema>

export const WeekMealRowSchema = z.object({
  week_id: z.string().uuid(),
  day: DayNameSchema,
  meal: MealSlotSchema,
  recipe_id: z.string().uuid(),
})
export type WeekMealRow = z.infer<typeof WeekMealRowSchema>

// La "base de datos" local completa: una lista de filas por tabla.
export const LocalDatabaseSchema = z.object({
  schema_version: z.literal(1),
  saved_weeks: z.array(SavedWeekRowSchema),
  recipes: z.array(RecipeRowSchema),
  recipe_ingredients: z.array(RecipeIngredientRowSchema),
  // .default([]): ficheros escritos antes de existir esta tabla no la traen.
  recipe_steps: z.array(RecipeStepRowSchema).default([]),
  week_meals: z.array(WeekMealRowSchema),
})
export type LocalDatabase = z.infer<typeof LocalDatabaseSchema>

export const emptyDatabase = (): LocalDatabase => ({ schema_version: 1, saved_weeks: [], recipes: [], recipe_ingredients: [], recipe_steps: [], week_meals: [] })

// Clave única de una receta (columna recipes.fingerprint): hash de TODO su contenido, así un plato
// idéntico reutiliza la fila y cualquier diferencia (otra descripción, otro ingrediente) es otra
// receta. Ver el comentario de la tabla recipes en schema.sql.
export function recipeFingerprint(dish: FinalDish): string {
  const content = [dish.title, dish.description, dish.ingredients, dish.proteinCategory, dish.sourceKind, dish.sourceName, dish.sourceUrl ?? null, dish.totalTimeMinutes ?? null, dish.difficulty ?? null, dish.steps ?? []]
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
