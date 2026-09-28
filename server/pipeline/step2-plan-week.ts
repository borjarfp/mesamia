import { generateStructured, textPart } from '../clients/gemini'
import { GEMINI_MODEL_PRO } from '../env'
import { buildWeekPlanningSystemInstruction, buildWeekPlanningUserPrompt } from '../prompts/weekPlanning'
import { validateWeekDraft } from '../rules/engine'
import { PLANNED_SLOTS, WeekPlanDraftSchema, type PlannedDish, type RuleViolation, type SchoolMenuExtraction } from '../types'

const MAX_PLANNING_ATTEMPTS = 3

export type PlanWeekResult = {
  slots: PlannedDish[]
  violations: RuleViolation[]
  attempts: number
}

// Paso 2: le pide a Gemini los 14 huecos y valida el resultado contra el motor de reglas (rules
// engine, determinista — no nos fiamos de que el LLM cuente bien sus propias raciones). Si hay
// incumplimientos, se reintenta pasándole exactamente qué ha fallado, hasta MAX_PLANNING_ATTEMPTS
// veces. Esto es lo que convierte el paso en un pipeline con verificación, no una única llamada a
// ciegas: la fuente de verdad de "¿cumple las reglas?" es siempre nuestro código, nunca el LLM.
export async function planWeek(schoolMenu: SchoolMenuExtraction, tasteContext?: string): Promise<PlanWeekResult> {
  let violations: RuleViolation[] = []
  let slots: PlannedDish[] = []

  for (let attempt = 1; attempt <= MAX_PLANNING_ATTEMPTS; attempt++) {
    const draft = await generateStructured({
      model: GEMINI_MODEL_PRO,
      schema: WeekPlanDraftSchema,
      systemInstruction: buildWeekPlanningSystemInstruction(),
      contents: [{ role: 'user', parts: [textPart(buildWeekPlanningUserPrompt(schoolMenu, tasteContext, violations))] }],
      // Un poco más de determinismo en la planificación que en la extracción/consolidación: aquí
      // interesa que respete las reglas de forma consistente entre reintentos.
      temperature: 0.3,
    })

    slots = normalizeSlots(draft.slots)
    violations = validateWeekDraft(slots, schoolMenu)
    if (violations.length === 0) {
      return { slots, violations: [], attempts: attempt }
    }
  }

  // Se agotaron los reintentos: se devuelve el último borrador igualmente (mejor un menú con
  // algún aviso que ningún menú), pero con las violaciones para que el llamador decida — la ruta
  // HTTP las expone en la respuesta en vez de ocultarlas.
  return { slots, violations, attempts: MAX_PLANNING_ATTEMPTS }
}

// Gemini puede devolver los huecos en cualquier orden, o (más raro, pero posible) duplicar/omitir
// alguno a pesar de la instrucción. Se reordena a PLANNED_SLOTS y se completa cualquier hueco que
// falte con un plato neutro, para que el resto del pipeline pueda asumir siempre exactamente 14.
function normalizeSlots(rawSlots: PlannedDish[]): PlannedDish[] {
  return PLANNED_SLOTS.map(expected => {
    const match = rawSlots.find(slot => slot.day === expected.day && slot.meal === expected.meal)
    if (match) return match
    return {
      day: expected.day,
      meal: expected.meal,
      title: 'Plato sencillo de la semana',
      mainIngredients: ['verduras de temporada'],
      proteinCategory: 'otro' as const,
      totalTimeMinutes: 20,
      difficulty: 'facil' as const,
      rationale: 'Hueco de relleno: Gemini no propuso nada para esta combinación de día y comida.',
    }
  })
}
