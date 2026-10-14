import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DayNameSchema, DifficultySchema, DishSourceKindSchema, MealChangeKindSchema, MealSlotSchema, ProteinCategorySchema, ShoppingListSchema, type FinalDish } from '../types'

// Espejo en TypeScript/zod de las tablas de server/db/schema.sql — mismos nombres de tabla y de
// columna (snake_case), para que pasar del JSON local a una BD real sea cambiar el almacenamiento,
// no el modelo. Si se toca una tabla aquí, tocarla también en schema.sql (y viceversa).

export const FamilyRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
})
export type FamilyRow = z.infer<typeof FamilyRowSchema>

export const FamilyMemberRowSchema = z.object({
  family_id: z.string().uuid(),
  email: z.string(),
  created_at: z.string(),
})
export type FamilyMemberRow = z.infer<typeof FamilyMemberRowSchema>

// Reglas del menú de cada familia (FamilyRules, server/rules/family-rules.ts) como un documento JSON.
// Una familia sin fila usa DEFAULT_FAMILY_RULES. `rules` se valida al leerlo (parseStoredRules), no aquí:
// un documento mal formado no debe impedir cargar el resto de la base de datos local.
export const FamilyRulesRowSchema = z.object({
  family_id: z.string().uuid(),
  rules: z.unknown(),
  updated_at: z.string(),
})
export type FamilyRulesRow = z.infer<typeof FamilyRulesRowSchema>

export const SavedWeekRowSchema = z.object({
  id: z.string().uuid(),
  // Familia dueña de la semana. NULL solo en semanas guardadas antes de existir las familias: las
  // adopta la primera familia que se crea (ver server/families/).
  family_id: z.string().uuid().nullable().default(null),
  label: z.string(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  generated_at: z.string(),
  created_at: z.string(),
  // JSON de ShoppingList; NULL hasta que se genera. .default: ficheros anteriores no lo traen.
  shopping_list: ShoppingListSchema.nullable().default(null),
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
  // .default(null): filas escritas antes de registrar cambios no las traen (= aceptada tal cual).
  proposed_title: z.string().nullable().default(null),
  change_kind: MealChangeKindSchema.nullable().default(null),
})
export type WeekMealRow = z.infer<typeof WeekMealRowSchema>

// La "base de datos" local completa: una lista de filas por tabla.
export const LocalDatabaseSchema = z.object({
  schema_version: z.literal(1),
  // .default([]): ficheros escritos antes de existir las familias no las traen.
  families: z.array(FamilyRowSchema).default([]),
  family_members: z.array(FamilyMemberRowSchema).default([]),
  family_rules: z.array(FamilyRulesRowSchema).default([]),
  saved_weeks: z.array(SavedWeekRowSchema),
  recipes: z.array(RecipeRowSchema),
  recipe_ingredients: z.array(RecipeIngredientRowSchema),
  // .default([]): ficheros escritos antes de existir esta tabla no la traen.
  recipe_steps: z.array(RecipeStepRowSchema).default([]),
  week_meals: z.array(WeekMealRowSchema),
})
export type LocalDatabase = z.infer<typeof LocalDatabaseSchema>

export const emptyDatabase = (): LocalDatabase => ({ schema_version: 1, families: [], family_members: [], family_rules: [], saved_weeks: [], recipes: [], recipe_ingredients: [], recipe_steps: [], week_meals: [] })

// Clave única de una receta (columna recipes.fingerprint): hash de TODO su contenido, así un plato
// idéntico reutiliza la fila y cualquier diferencia (otra descripción, otro ingrediente) es otra
// receta. Ver el comentario de la tabla recipes en schema.sql.
export function recipeFingerprint(dish: FinalDish): string {
  const content = [dish.title, dish.description, dish.ingredients, dish.proteinCategory, dish.sourceKind, dish.sourceName, dish.sourceUrl ?? null, dish.totalTimeMinutes ?? null, dish.difficulty ?? null, dish.steps ?? []]
  return createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
