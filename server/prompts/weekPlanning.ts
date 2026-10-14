import type { FamilyRules } from '../rules/family-rules'
import { buildNotesLines, buildRestrictionLines, buildWeeklyLimitLines } from './familyRules'
import { TASTE_CONTEXT_INSTRUCTIONS, TASTE_HISTORY_WEEKS } from '../history/taste-context'
import { formatSchoolWeek, SCHOOL_CONTEXT_LINES } from './schoolContext'
import { PLANNED_SLOTS, PROTEIN_CATEGORIES, type RuleViolation, type SchoolMenuExtraction } from '../types'

// Paso 2: instrucción de sistema para planificar los 14 huecos de la semana (comida y cena de los
// 7 días — TODOS, incluida la comida de lunes a viernes). El menú escolar de las niñas nunca es un
// hueco a rellenar ni se muestra en ningún sitio: es solo contexto para que la cena de los días de
// cole no repita lo que ellas ya han comido. La comida de lunes a viernes es para los adultos de la
// casa (las niñas comen en el cole/guardería ese mismo mediodía, aparte).
export function buildWeekPlanningSystemInstruction(rules: FamilyRules): string {
  return [
    'Eres el planificador de menús de una app familiar. Tu tarea es proponer, para cada "hueco" indicado, un plato equilibrado, variado y realista para cocinar en casa.',
    `Los huecos a planificar son exactamente estos ${PLANNED_SLOTS.length}: ${PLANNED_SLOTS.map(slot => `${slot.day}/${slot.meal}`).join(', ')}.`,
    'La "comida" de lunes a viernes es para los padres/adultos de la casa, no para las niñas: ellas comen en el cole/guardería ese mismo mediodía (se te da su menú como contexto).',
    'Para cada hueco, define:',
    '- title: nombre del plato.',
    '- mainIngredients: 2-4 ingredientes principales, en minúsculas.',
    `- proteinCategory: una de ${PROTEIN_CATEGORIES.join(', ')}.`,
    '- totalTimeMinutes: tiempo total realista de la receta (preparación + cocción), en minutos.',
    '- difficulty: facil, media o dificil.',
    '- rationale (opcional): una frase breve justificando la elección.',
    'Reglas estrictas que la semana COMPLETA debe cumplir:',
    ...SCHOOL_CONTEXT_LINES,
    ...buildWeeklyLimitLines(rules),
    ...buildRestrictionLines(rules),
    ...buildNotesLines(rules),
    'Devuelve exclusivamente el JSON solicitado, con exactamente un elemento por hueco indicado.',
  ].join('\n')
}

export function buildWeekPlanningUserPrompt(
  schoolMenu: SchoolMenuExtraction,
  // Texto de server/history/taste-context.ts ('' o undefined si no hay semanas anteriores).
  tasteContext: string | undefined,
  previousViolations: RuleViolation[] | undefined,
): string {
  const parts = [
    'Menú escolar de las niñas esta semana (contexto para la comida de los adultos, la inspiración de la cena y la regla de no repetir; no se te pide generar nada para las niñas):',
    formatSchoolWeek(schoolMenu),
  ]

  if (tasteContext) {
    parts.push(
      `Historial de las ${TASTE_HISTORY_WEEKS} semanas anteriores que guardó la familia, con lo que cambiaron de cada propuesta:`,
      tasteContext,
      TASTE_CONTEXT_INSTRUCTIONS,
    )
  }

  if (previousViolations && previousViolations.length > 0) {
    parts.push(
      'Tu propuesta anterior incumplía estas reglas — corrígelas manteniendo todo lo demás igual si es posible:',
      previousViolations.map(violation => `- ${violation.message}`).join('\n'),
    )
  }

  return parts.join('\n\n')
}
