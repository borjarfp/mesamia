import { z } from 'zod'

// Días sin acentos ni mayúsculas: son valores de enum para el motor de reglas y los prompts, no
// texto para mostrar (eso lo decide el frontend). El orden importa para iterar Lunes -> Domingo.
export const DAY_NAMES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const
export const DayNameSchema = z.enum(DAY_NAMES)
export type DayName = z.infer<typeof DayNameSchema>
export const WEEKDAYS = DAY_NAMES.slice(0, 5) as readonly DayName[]

export const MealSlotSchema = z.enum(['comida', 'cena'])
export type MealSlot = z.infer<typeof MealSlotSchema>

// "Tipología del plato" (motor de reglas) = esta categoría de proteína. Es la clasificación más
// concreta y comprobable que da el enunciado; ver server/rules/engine.ts para la interpretación.
export const PROTEIN_CATEGORIES = ['huevo', 'ave', 'pescado', 'carne_roja', 'legumbre', 'otro'] as const
export const ProteinCategorySchema = z.enum(PROTEIN_CATEGORIES)
export type ProteinCategory = z.infer<typeof ProteinCategorySchema>

// Dificultad de una receta. De lunes a viernes solo se admite 'facil' (ver server/rules/restrictions.ts).
export const DIFFICULTIES = ['facil', 'media', 'dificil'] as const
export const DifficultySchema = z.enum(DIFFICULTIES)
export type Difficulty = z.infer<typeof DifficultySchema>

// ---------------------------------------------------------------------------
// Paso 1: extracción OCR/estructuración del menú escolar (Gemini)
// ---------------------------------------------------------------------------

export const SchoolMealEntrySchema = z.object({
  day: DayNameSchema,
  title: z.string().describe('Nombre del plato tal como aparece en el menú escolar'),
  mainIngredients: z.array(z.string()).describe('Ingredientes principales, en minúsculas y sin adjetivos'),
  proteinCategory: ProteinCategorySchema,
})
export type SchoolMealEntry = z.infer<typeof SchoolMealEntrySchema>

export const ChildSchoolMenuSchema = z.object({
  child: z.string().describe('Nombre de la niña a la que pertenece este menú (p. ej. "Aina" o "Iria")'),
  meals: z.array(SchoolMealEntrySchema),
})
export type ChildSchoolMenu = z.infer<typeof ChildSchoolMenuSchema>

// JSON "unificado" que pide el enunciado: un único documento que cubre a ambas niñas, aunque cada
// una pueda tener un menú distinto (cole vs. guardería).
export const SchoolMenuExtractionSchema = z.object({
  children: z.array(ChildSchoolMenuSchema),
})
export type SchoolMenuExtraction = z.infer<typeof SchoolMenuExtractionSchema>

// ---------------------------------------------------------------------------
// Paso 2: planificación de los huecos (Gemini) — antes de buscar receta real
// ---------------------------------------------------------------------------

// Los 14 huecos que planifica el sistema: comida + cena de los 7 días. El menú escolar (Paso 1)
// NUNCA ocupa un hueco ni se muestra — es solo contexto para que la cena de cada día de colegio no
// repita lo que las niñas ya han comido (ver server/rules/engine.ts). La comida de lunes a viernes
// es una comida real, generada para los padres — a petición explícita: "no me interesa saber lo
// que comen mis hijas, solo quiero que genere comidas para nosotros".
export const PLANNED_SLOTS: ReadonlyArray<{ day: DayName; meal: MealSlot }> = DAY_NAMES.flatMap(day => [
  { day, meal: 'comida' as const },
  { day, meal: 'cena' as const },
])

export const PlannedDishSchema = z.object({
  day: DayNameSchema,
  meal: MealSlotSchema,
  title: z.string(),
  mainIngredients: z.array(z.string()),
  proteinCategory: ProteinCategorySchema,
  totalTimeMinutes: z.number().int().describe('Tiempo total estimado de la receta (preparación + cocción), en minutos'),
  difficulty: DifficultySchema,
  rationale: z.string().optional().describe('Explicación breve de por qué este plato encaja aquí'),
})
export type PlannedDish = z.infer<typeof PlannedDishSchema>

export const WeekPlanDraftSchema = z.object({
  slots: z.array(PlannedDishSchema),
})
export type WeekPlanDraft = z.infer<typeof WeekPlanDraftSchema>

// Para sustituir UN hueco ya existente: el día/comida ya se conocen (van fuera del JSON que
// devuelve Gemini), así que el esquema de cada alternativa los omite.
export const AlternativeDishSchema = PlannedDishSchema.omit({ day: true, meal: true })
export type AlternativeDish = z.infer<typeof AlternativeDishSchema>
export const AlternativesDraftSchema = z.object({
  alternatives: z.array(AlternativeDishSchema),
})
export type AlternativesDraft = z.infer<typeof AlternativesDraftSchema>

export const RuleViolationSchema = z.object({
  rule: z.string().describe('Identificador de la regla incumplida, p. ej. "max_huevo"'),
  message: z.string().describe('Explicación en español, pensada tanto para el usuario final como para re-prompting'),
  day: DayNameSchema.optional(),
  meal: MealSlotSchema.optional(),
})
export type RuleViolation = z.infer<typeof RuleViolationSchema>

// ---------------------------------------------------------------------------
// Paso 4: receta consolidada/estandarizada (Gemini, a partir del contenido de Tavily)
// ---------------------------------------------------------------------------

export const ConsolidatedRecipeSchema = z.object({
  title: z.string().describe('Título corto y atractivo del plato'),
  description: z.string().describe('Una frase que resuma el plato'),
  ingredients: z.array(z.string()),
  totalTimeMinutes: z.number().int().describe('Tiempo total de la receta en minutos (el que indique la página; si no lo indica, estímalo)'),
  difficulty: DifficultySchema.describe('Dificultad de la receta (la que indique la página; si no la indica, estímala)'),
})
export type ConsolidatedRecipe = z.infer<typeof ConsolidatedRecipeSchema>

// Paso 4 real: elegir la mejor receta para un plato entre las candidatas web (numeradas "1".."3") y
// la propia de Gemini ("ia"), y devolverla ya estandarizada. `choice` y `reason` van primero para
// que Gemini decida antes de escribir la receta (genera las propiedades en este orden).
export const RECIPE_CHOICES = ['ia', '1', '2', '3'] as const
export const RecipeSelectionSchema = z.object({
  choice: z.enum(RECIPE_CHOICES).describe('"ia" para tu propia receta, o el número de la receta web candidata elegida'),
  reason: z.string().describe('Una frase: por qué esta opción es la mejor'),
  ...ConsolidatedRecipeSchema.shape,
})
export type RecipeSelection = z.infer<typeof RecipeSelectionSchema>

// ---------------------------------------------------------------------------
// Semana final ensamblada — lo que consume (o consumirá) el frontend
// ---------------------------------------------------------------------------

// Ya no existe 'escolar': el menú del cole nunca ocupa un hueco de la semana final ni se muestra —
// es solo contexto de las 14 llamadas de planificación (ver PLANNED_SLOTS), para que las cenas de
// los días de cole no repitan lo que las niñas ya han comido. Todo plato final es 'ia' o 'web'.
export const DishSourceKindSchema = z.enum(['ia', 'web'])
export type DishSourceKind = z.infer<typeof DishSourceKindSchema>

export const FinalDishSchema = z.object({
  title: z.string(),
  description: z.string(),
  ingredients: z.array(z.string()),
  proteinCategory: ProteinCategorySchema,
  sourceKind: DishSourceKindSchema,
  // Nombre a mostrar: 'Generado por IA' | 'Cookidoo' | 'El Comidista' | 'Cookpad' | 'Directo al
  // Paladar' | 'Petitchef' — mismo vocabulario que sourceStyles en lib/menu-data.ts.
  sourceName: z.string(),
  sourceUrl: z.string().optional(),
  // Opcionales: las semanas guardadas antes de añadir estos campos no los tienen, y el plato
  // escrito a mano en el Drawer tampoco.
  totalTimeMinutes: z.number().int().optional(),
  difficulty: DifficultySchema.optional(),
})
export type FinalDish = z.infer<typeof FinalDishSchema>

export const FinalDayPlanSchema = z.object({
  day: DayNameSchema,
  comida: FinalDishSchema,
  cena: FinalDishSchema,
})
export type FinalDayPlan = z.infer<typeof FinalDayPlanSchema>

export const WeekPlanSchema = z.object({
  days: z.array(FinalDayPlanSchema),
  generatedAt: z.string().describe('ISO 8601'),
})
export type WeekPlan = z.infer<typeof WeekPlanSchema>

// Resumen de una semana pasada, para dar contexto al Paso 2 sin mandar el JSON completo (Gemini no
// necesita cada ingrediente de cada semana anterior, solo un resumen de qué tipo de platos gustaron).
export const HistorySummarySchema = z.object({
  label: z.string(),
  highlights: z.array(z.string()).describe('Títulos o notas breves de platos que funcionaron bien esa semana'),
})
export type HistorySummary = z.infer<typeof HistorySummarySchema>

export const HistoryEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.string(),
  weekStart: z.string().optional().describe('Lunes de la semana planificada, YYYY-MM-DD'),
  week: WeekPlanSchema,
})
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>
