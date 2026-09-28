import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MIN_LEGUMBRE } from '../rules/constants'
import { FAMILY_RESTRICTION_LINES } from './weekPlanning'
import { PROTEIN_CATEGORIES, type DayName, type MealSlot, type RuleViolation, type WeekPlan } from '../types'

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
    '- Si el hueco es una cena de lunes a viernes, no puede repetir la categoría de proteína ni los ingredientes principales de la comida escolar de ese día (se te da como contexto).',
    'Devuelve exclusivamente el JSON solicitado.',
  ].join('\n')
}

export function buildSubstitutionUserPrompt(
  day: DayName,
  meal: MealSlot,
  currentWeek: WeekPlan,
  previousViolations: RuleViolation[] | undefined,
): string {
  const parts = [
    `Hueco a sustituir: ${day} / ${meal}.`,
    'Resto de la semana ya fijado (no lo cambies, es solo contexto para no romper los límites semanales):',
    JSON.stringify(currentWeek, null, 2),
  ]
  if (previousViolations && previousViolations.length > 0) {
    parts.push(
      'La tanda anterior de alternativas incumplía esto — corrígelo:',
      previousViolations.map(violation => `- ${violation.message}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}
