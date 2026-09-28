import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MAX_WEEKDAY_MINUTES, MIN_LEGUMBRE, TARGET_WEEKDAY_MINUTES } from '../rules/constants'
import { TASTE_CONTEXT_INSTRUCTIONS, TASTE_HISTORY_WEEKS } from '../history/taste-context'
import { formatSchoolWeek, SCHOOL_CONTEXT_LINES } from './schoolContext'
import { PLANNED_SLOTS, PROTEIN_CATEGORIES, type RuleViolation, type SchoolMenuExtraction } from '../types'

// Restricciones de la familia, compartidas por la planificación de la semana y la sustitución. Las
// mismas que comprueba server/rules/restrictions.ts — si se cambia una, cambiar la otra.
export const FAMILY_RESTRICTION_LINES = [
  '- Sin marisco: nada de gambas, langostinos, mejillones, almejas, cangrejo, etc. Pota, calamar, pulpo y sepia SÍ están permitidos (clasifícalos como "pescado").',
  '- Sin atún (ni bonito), ni fresco ni en lata.',
  '- Sin aceitunas (el aceite de oliva sí está permitido).',
  '- Sin champiñones y sin tofu.',
  '- El único pescado permitido es merluza o salmón (además de pota, calamar, pulpo o sepia). Ningún otro pescado, tampoco como ingrediente secundario (anchoas, bacalao...). En los platos de pescado, nombra la especie en el título o en mainIngredients.',
  `- De lunes a viernes (comida y cena), recetas fáciles (difficulty "facil") y rápidas: idealmente ${TARGET_WEEKDAY_MINUTES} min en total, nunca más de ${MAX_WEEKDAY_MINUTES} min (totalTimeMinutes). El fin de semana no tiene límite de tiempo ni de dificultad.`,
]

// Paso 2: instrucción de sistema para planificar los 14 huecos de la semana (comida y cena de los
// 7 días — TODOS, incluida la comida de lunes a viernes). El menú escolar de las niñas nunca es un
// hueco a rellenar ni se muestra en ningún sitio: es solo contexto para que la cena de los días de
// cole no repita lo que ellas ya han comido. La comida de lunes a viernes es para los adultos de la
// casa (las niñas comen en el cole/guardería ese mismo mediodía, aparte).
export function buildWeekPlanningSystemInstruction(): string {
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
    `- Máximo ${MAX_HUEVO} raciones de "huevo" en toda la semana.`,
    `- Máximo ${MAX_AVE} raciones de "ave" en toda la semana.`,
    `- Máximo ${MAX_PESCADO} raciones de "pescado" en toda la semana.`,
    `- Máximo ${MAX_CARNE_ROJA} ración de "carne_roja" en toda la semana.`,
    `- Mínimo ${MIN_LEGUMBRE} raciones de "legumbre" en toda la semana.`,
    ...FAMILY_RESTRICTION_LINES,
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
