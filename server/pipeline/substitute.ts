import { generateStructured, textPart } from '../clients/gemini'
import { GEMINI_MODEL_PRO } from '../env'
import { buildSubstitutionSystemInstruction, buildSubstitutionUserPrompt } from '../prompts/substitution'
import { validateWeekDraft } from '../rules/engine'
import {
  AlternativesDraftSchema,
  PLANNED_SLOTS,
  type DayName,
  type FinalDish,
  type MealSlot,
  type PlannedDish,
  type RuleViolation,
  type SchoolMenuExtraction,
  type WeekPlan,
} from '../types'
import { dishFromPlannedSlot } from './assemble'
import { selectRecipes } from './step4-consolidate'
import { fetchRecipes } from './step3-fetch-recipes'

const MAX_SUBSTITUTION_ATTEMPTS = 2
const DEFAULT_ALTERNATIVES_COUNT = 3

export type SubstituteInput = {
  day: DayName
  meal: MealSlot
  currentWeek: WeekPlan
  // Opcional: sin ella no se puede comprobar "no repetir la comida escolar", pero el resto de
  // reglas (límites semanales) se sigue validando igual.
  schoolMenu?: SchoolMenuExtraction
  count?: number
}

export type SubstituteResult = {
  alternatives: FinalDish[]
  violations: RuleViolation[]
}

// `validateWeekDraft` revalida la semana ENTERA (los otros 13 huecos + el candidato), así que puede
// devolver violaciones que ya existían antes en un día distinto al que se está sustituyendo —
// cambiar el hueco de hoy no puede arreglar algo que está mal en otro día. Sin este filtro, esas
// violaciones ajenas: (a) nunca desaparecen por mucho que se reintente, gastando llamadas de más
// (encontrado probando con la API real), y (b) contaminan la respuesta dando a entender que la
// sustitución en sí ha fallado. Sí cuentan las de máximos/mínimos semanales (max_/min_): esas SÍ
// las puede empeorar o arreglar el propio candidato, porque se cuentan sobre las 14 raciones.
function isRelevantViolation(violation: RuleViolation, day: DayName, meal: MealSlot): boolean {
  if (violation.rule.startsWith('max_') || violation.rule.startsWith('min_')) return true
  return violation.day === day && violation.meal === meal
}

// Reconstruye los 14 huecos planificados (mismo shape que usa el motor de reglas) a partir de la
// semana final ya ensamblada — así la sustitución valida contra la MISMA función que la
// planificación inicial (server/rules/engine.ts), en vez de reimplementar la cuenta de raciones.
function plannedSlotsFromWeek(week: WeekPlan): PlannedDish[] {
  return PLANNED_SLOTS.map(slot => {
    const dayPlan = week.days.find(day => day.day === slot.day)
    const dish = slot.meal === 'comida' ? dayPlan?.comida : dayPlan?.cena
    return {
      day: slot.day,
      meal: slot.meal,
      title: dish?.title ?? '',
      mainIngredients: dish?.ingredients ?? [],
      proteinCategory: dish?.proteinCategory ?? 'otro',
      // Semanas antiguas o platos escritos a mano no traen tiempo/dificultad: 0/'facil' para que no
      // disparen las reglas de entre semana (que en cualquier caso solo cuentan para el hueco
      // sustituido, ver isRelevantViolation).
      totalTimeMinutes: dish?.totalTimeMinutes ?? 0,
      difficulty: dish?.difficulty ?? 'facil',
    }
  })
}

// Sustituir un plato: se piden `count` alternativas a la vez (igual que el Drawer del frontend,
// que ofrece 3 opciones), se validan contra el resto de la semana ya fijada, y solo entonces se
// busca receta real (Tavily) + se consolida (Gemini) para las que hayan quedado bien.
export async function substituteDish(input: SubstituteInput): Promise<SubstituteResult> {
  const { day, meal, currentWeek } = input
  const schoolMenu = input.schoolMenu ?? { children: [] }
  const count = input.count ?? DEFAULT_ALTERNATIVES_COUNT

  // Ya no hace falta comprobar que day/meal sea uno de los PLANNED_SLOTS: ahora cubren los 14
  // huecos (comida+cena de los 7 días), así que cualquier combinación válida de DayName/MealSlot
  // — que el esquema zod de la ruta ya garantiza — es siempre sustituible.
  const otherSlots = plannedSlotsFromWeek(currentWeek).filter(slot => !(slot.day === day && slot.meal === meal))

  let violations: RuleViolation[] = []
  let alternatives: PlannedDish[] = []

  for (let attempt = 1; attempt <= MAX_SUBSTITUTION_ATTEMPTS; attempt++) {
    const draft = await generateStructured({
      model: GEMINI_MODEL_PRO,
      schema: AlternativesDraftSchema,
      systemInstruction: buildSubstitutionSystemInstruction(count),
      contents: [{ role: 'user', parts: [textPart(buildSubstitutionUserPrompt(day, meal, currentWeek, violations))] }],
      // Más variedad entre las alternativas que en la planificación completa de la semana.
      temperature: 0.6,
    })

    alternatives = draft.alternatives.slice(0, count).map(alt => ({ day, meal, ...alt }))
    violations = alternatives
      .flatMap(alternative => validateWeekDraft([...otherSlots, alternative], schoolMenu))
      .filter(violation => isRelevantViolation(violation, day, meal))
    if (violations.length === 0) break
  }

  // Clave por posición, NO por día+comida: las N alternativas comparten el mismo (day, meal) —
  // son N candidatas para el mismo hueco —, así que slotKey(day, meal) colisionaría y las N
  // acabarían leyendo la receta de una sola de ellas (bug real, encontrado probando con la API
  // real: las 3 alternativas devueltas salían con el mismo título y la misma URL).
  const lookups = await fetchRecipes(alternatives.map((dish, index) => ({ key: `alt:${index}`, dish })))
  const selected = await selectRecipes(lookups)
  const finalAlternatives = alternatives.map((alternative, index) => dishFromPlannedSlot(alternative, `alt:${index}`, selected))

  return { alternatives: finalAlternatives, violations }
}
