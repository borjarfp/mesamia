import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MIN_LEGUMBRE } from '../rules/constants'
import { TASTE_CONTEXT_INSTRUCTIONS, TASTE_HISTORY_WEEKS } from '../history/taste-context'
import { formatSchoolDay, SCHOOL_CONTEXT_LINES } from './schoolContext'
import { FAMILY_RESTRICTION_LINES } from './weekPlanning'
import { PROTEIN_CATEGORIES, WEEKDAYS, type DayName, type MealSlot, type RuleViolation, type SchoolMenuExtraction, type WeekPlan } from '../types'

// Sustitución de un plato concreto: se le da a Gemini el resto de la semana ya fijado (para que no
// rompa los límites semanales) y se le piden `count` alternativas de una sola vez — igual que en el
// frontend mock, donde "Cambiar" ofrece 3 opciones a elegir, no una sola.
export function buildSubstitutionSystemInstruction(count: number): string {
  return [
    `Propón exactamente ${count} alternativas distintas de plato para UN único hueco de un menú semanal familiar, manteniendo fijo el resto de la semana que se te da como contexto.`,
    'Para cada alternativa define:',
    '- title: nombre del plato.',
    '- mainIngredients: 2-4 ingredientes principales, en minúsculas.',
    `- proteinCategory: una de ${PROTEIN_CATEGORIES.join(', ')}.`,
    '- totalTimeMinutes: tiempo total realista de la receta (preparación + cocción), en minutos.',
    '- difficulty: facil, media o dificil.',
    '- rationale (opcional): una frase breve.',
    'Las alternativas deben ser variadas entre sí (no repitas la misma categoría de proteína en las tres si es evitable).',
    'Cada alternativa, sustituyendo únicamente el hueco indicado, debe seguir cumpliendo estas reglas para la semana completa:',
    `- Máximo ${MAX_HUEVO} huevo, ${MAX_AVE} ave, ${MAX_PESCADO} pescado, ${MAX_CARNE_ROJA} carne_roja; mínimo ${MIN_LEGUMBRE} legumbre, en total en la semana.`,
    ...FAMILY_RESTRICTION_LINES,
    'Si el hueco es de lunes a viernes, aplica también esto (se te da el menú escolar de ese día):',
    ...SCHOOL_CONTEXT_LINES.map(line => `  ${line}`),
    'Devuelve exclusivamente el JSON solicitado.',
  ].join('\n')
}

export function buildSubstitutionUserPrompt(
  day: DayName,
  meal: MealSlot,
  currentWeek: WeekPlan,
  previousViolations: RuleViolation[] | undefined,
  tasteContext?: string,
  schoolMenu?: SchoolMenuExtraction,
): string {
  const parts = [
    `Hueco a sustituir: ${day} / ${meal}.`,
    'Resto de la semana ya fijado (no lo cambies, es solo contexto para no romper los límites semanales):',
    JSON.stringify(currentWeek, null, 2),
  ]
  // Antes este prompt decía "se te da como contexto" la comida escolar, pero nunca se incluía:
  // Gemini proponía a ciegas y solo el motor de reglas lo cazaba después (con un reintento).
  if (schoolMenu && WEEKDAYS.includes(day)) parts.push('Menú escolar de ese día:', formatSchoolDay(schoolMenu, day))
  if (tasteContext) {
    parts.push(
      `Historial de las ${TASTE_HISTORY_WEEKS} semanas anteriores que guardó la familia, con lo que cambiaron de cada propuesta:`,
      tasteContext,
      TASTE_CONTEXT_INSTRUCTIONS,
    )
  }
  if (previousViolations && previousViolations.length > 0) {
    parts.push(
      'La tanda anterior de alternativas incumplía esto — corrígelo:',
      previousViolations.map(violation => `- ${violation.message}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}
