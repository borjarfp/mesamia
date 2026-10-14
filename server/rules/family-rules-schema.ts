import { z } from 'zod'
import { DEFAULT_FAMILY_RULES, FISH_KEYS, MEAT_KEYS, RULE_LIMITS, type FamilyRules } from './family-rules'

// Validación de las reglas que llegan por la API o se leen de la BD. Todos los campos llevan valor
// por defecto, así que un documento guardado con menos campos (de una versión anterior) sigue siendo
// válido: lo que falta toma el valor por defecto.
const D = DEFAULT_FAMILY_RULES
// `null` = sin límite (una familia nueva empieza así). Un campo AUSENTE toma el valor por defecto; uno `null` explícito, no.
const servings = (fallback: number | null) => z.number().int().min(RULE_LIMITS.servings.min).max(RULE_LIMITS.servings.max).nullable().default(fallback)
const minutes = (fallback: number | null) => z.number().int().min(RULE_LIMITS.minutes.min).max(RULE_LIMITS.minutes.max).nullable().default(fallback)
const flag = (fallback: boolean) => z.boolean().default(fallback)

// Versión anterior: cinco interruptores (noMarisco…noTofu) en vez de palabras en `custom`. Un documento
// guardado así se migra al leerlo: cada interruptor activo (o ausente, que valía true) pasa a ser su
// palabra, para que la familia no pierda ninguna prohibición en silencio.
const LEGACY_FLAGS = [['noMarisco', 'marisco'], ['noAtun', 'atún'], ['noAceitunas', 'aceitunas'], ['noChampinones', 'champiñones'], ['noTofu', 'tofu']] as const
function migrateLegacyRules(value: unknown): unknown {
  const ingredients = (value as { ingredients?: Record<string, unknown> } | null)?.ingredients
  if (!ingredients || typeof ingredients !== 'object' || !LEGACY_FLAGS.some(([flag]) => flag in ingredients)) return value
  const custom = Array.isArray(ingredients.custom) ? [...ingredients.custom] : []
  for (const [flag, word] of LEGACY_FLAGS) if (ingredients[flag] !== false && !custom.includes(word)) custom.push(word)
  const { noMarisco: _a, noAtun: _b, noAceitunas: _c, noChampinones: _d, noTofu: _e, ...rest } = ingredients
  return { ...(value as object), ingredients: { ...rest, custom } }
}

const RulesObjectSchema = z.object({
  weekly: z.object({
    maxHuevo: servings(D.weekly.maxHuevo),
    maxAve: servings(D.weekly.maxAve),
    maxPescado: servings(D.weekly.maxPescado),
    maxCarneRoja: servings(D.weekly.maxCarneRoja),
    minLegumbre: servings(D.weekly.minLegumbre),
  }).default(D.weekly),
  weekday: z.object({ targetMinutes: minutes(D.weekday.targetMinutes), maxMinutes: minutes(D.weekday.maxMinutes), onlyEasy: flag(D.weekday.onlyEasy) }).default(D.weekday),
  ingredients: z.object({
    restrictFish: flag(D.ingredients.restrictFish),
    allowedFish: z.array(z.enum(FISH_KEYS)).max(FISH_KEYS.length).default(D.ingredients.allowedFish),
    restrictMeat: flag(D.ingredients.restrictMeat),
    allowedMeat: z.array(z.enum(MEAT_KEYS)).max(MEAT_KEYS.length).default(D.ingredients.allowedMeat),
    custom: z.array(z.string().trim().min(1).max(RULE_LIMITS.customWordLength)).max(RULE_LIMITS.customWords).default(D.ingredients.custom),
  }).default(D.ingredients),
  notes: z.string().max(RULE_LIMITS.notesLength).default(D.notes),
}).refine(rules => rules.weekday.targetMinutes === null || rules.weekday.maxMinutes === null || rules.weekday.targetMinutes <= rules.weekday.maxMinutes, { message: 'Los minutos objetivo no pueden superar el máximo.', path: ['weekday', 'targetMinutes'] })

export const FamilyRulesSchema = z.preprocess(migrateLegacyRules, RulesObjectSchema)

// Lo que hay guardado, o los valores por defecto si no hay nada o está corrupto (nunca debe romper una
// generación por un documento mal formado).
export function parseStoredRules(value: unknown): FamilyRules {
  const parsed = FamilyRulesSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : DEFAULT_FAMILY_RULES
}
