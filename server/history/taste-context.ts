import { DAY_NAMES, type FinalDish, type HistoryEntry, type MealChange } from '../types'
import { historyStore } from './store'

// Contexto de gustos para el LLM: las N semanas guardadas ANTERIORES a la que se va a planificar,
// en un texto pensado para que Gemini lo lea (no JSON: una línea por plato, con lo que importa).
// Se construye en el momento a partir del histórico real (HistoryStore) — no es un fichero aparte
// que mantener sincronizado: borrar o guardar una semana cambia el contexto al instante.
//
// La señal más útil no son los platos en sí, sino lo que la familia CAMBIÓ antes de confirmar
// (MealChange): qué propuso la IA y si lo sustituyó por una alternativa o escribiendo su propio
// plato. Cómo debe interpretarlo el LLM está en TASTE_CONTEXT_INSTRUCTIONS.
export const TASTE_HISTORY_WEEKS = 3

// Las N semanas guardadas justo antes de `weekStart` (YYYY-MM-DD, el lunes de la semana a
// planificar): estrictamente anteriores, así que planificar una semana que ya está guardada no se
// usa a sí misma de referencia. Si una misma semana se guardó varias veces, cuenta solo la última.
// Semanas guardadas sin `weekStart` (antiguas) se ordenan por fecha de guardado y cuentan como
// anteriores. Sin `weekStart`, simplemente las N más recientes.
export function selectPreviousWeeks(entries: HistoryEntry[], weekStart?: string, count = TASTE_HISTORY_WEEKS): HistoryEntry[] {
  const latestPerWeek = new Map<string, HistoryEntry>()
  for (const entry of entries) {
    if (weekStart && entry.weekStart && entry.weekStart >= weekStart) continue
    const key = entry.weekStart ?? `sin-fecha:${entry.id}`
    const current = latestPerWeek.get(key)
    if (!current || entry.createdAt > current.createdAt) latestPerWeek.set(key, entry)
  }
  const sortKey = (entry: HistoryEntry) => entry.weekStart ?? entry.createdAt.slice(0, 10)
  return [...latestPerWeek.values()].sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, count)
}

function dishDetails(dish: FinalDish): string {
  const details = [dish.proteinCategory, dish.sourceName, dish.totalTimeMinutes ? `${dish.totalTimeMinutes} min` : null].filter(Boolean)
  return `"${dish.title}" (${details.join(', ')})`
}

function mealLine(day: string, meal: 'comida' | 'cena', dish: FinalDish, change: MealChange | undefined): string {
  const slot = `${day} ${meal}`
  if (!change) return `- ${slot}: ${dishDetails(dish)} — aceptado tal cual.`
  if (change.kind === 'manual') return `- ${slot}: ${dishDetails(dish)} — ESCRITO A MANO por la familia; la IA había propuesto "${change.proposedTitle}" y lo rechazaron.`
  return `- ${slot}: ${dishDetails(dish)} — CAMBIADO: la IA había propuesto "${change.proposedTitle}" y eligieron esta alternativa.`
}

export function formatWeekForLlm(entry: HistoryEntry): string {
  const changes = entry.changes ?? []
  const lines = DAY_NAMES.flatMap(day => {
    const plan = entry.week.days.find(item => item.day === day)
    if (!plan) return []
    return (['comida', 'cena'] as const).map(meal => mealLine(day, meal, plan[meal], changes.find(change => change.day === day && change.meal === meal)))
  })
  const manual = changes.filter(change => change.kind === 'manual').length
  const replaced = changes.length - manual
  const header = `Semana ${entry.label}${entry.weekStart ? ` (lunes ${entry.weekStart})` : ''} — ${changes.length === 0 ? 'se aceptó toda la propuesta sin cambios' : `${replaced} plato(s) cambiado(s) por una alternativa y ${manual} escrito(s) a mano`}:`
  return [header, ...lines].join('\n')
}

// Cómo tiene que usar el LLM el historial. Va junto al propio historial en el prompt.
export const TASTE_CONTEXT_INSTRUCTIONS = [
  'Usa el historial de las semanas anteriores para adaptarte a los gustos de esta familia:',
  '- "ESCRITO A MANO" es la señal más fuerte: es lo que de verdad quieren comer. Propón platos de ese estilo y evita el tipo de plato que habías propuesto en su lugar.',
  '- "CAMBIADO" significa que la propuesta original no les convenció: evita platos parecidos a esa propuesta y tira hacia el estilo de la alternativa que eligieron.',
  '- "aceptado tal cual" es una señal débil (puede que simplemente no lo cambiaran): esos estilos funcionan, pero no los tomes como favoritos.',
  '- Fíjate en patrones (tipo de cocina, tiempos, ingredientes, fuentes de receta que eligen) más que en platos sueltos.',
  '- No repitas ningún plato exacto de la semana inmediatamente anterior. Un plato que les gustó hace 2-3 semanas sí puede volver.',
  '- El historial nunca está por encima de las reglas: las restricciones y límites semanales se cumplen siempre.',
].join('\n')

export type TasteContext = { weeks: Array<{ id: string; label: string; weekStart?: string }>; text: string }

// El contexto listo para el prompt: '' si no hay ninguna semana anterior guardada (primera vez).
export function buildTasteContext(entries: HistoryEntry[]): string {
  if (entries.length === 0) return ''
  return entries.map(formatWeekForLlm).join('\n\n')
}

export async function getTasteContext(weekStart?: string): Promise<TasteContext> {
  const weeks = selectPreviousWeeks(await historyStore.list(), weekStart)
  return { weeks: weeks.map(({ id, label, weekStart }) => ({ id, label, weekStart })), text: buildTasteContext(weeks) }
}
