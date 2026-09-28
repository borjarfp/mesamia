import type { DayName } from '@/server/types'
import { DAY_NAMES } from '@/server/types'

// Nombres de día para MOSTRAR (el backend usa 'lunes'..'domingo' en minúsculas y sin acentos,
// como valores de enum para el motor de reglas y los prompts — esto es solo la capa de UI).
const DAY_LABELS: Record<DayName, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
}

export function dayLabel(day: DayName): string {
  return DAY_LABELS[day]
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Lunes de la semana que contiene `reference` (por defecto, hoy).
function mondayOf(reference: Date): Date {
  const date = new Date(reference)
  const dayOfWeek = date.getDay() // 0 = domingo … 6 = sábado
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  date.setDate(date.getDate() + diffToMonday)
  date.setHours(0, 0, 0, 0)
  return date
}

export function formatWeekRange(monday: Date, sunday: Date): string {
  if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()} — ${sunday.getDate()} ${MONTHS[monday.getMonth()]}`
  return `${monday.getDate()} de ${MONTHS[monday.getMonth()]} — ${sunday.getDate()} de ${MONTHS[sunday.getMonth()]}`
}

// `start` = lunes de la semana en YYYY-MM-DD (fecha local, no toISOString(), que la pasaría a UTC).
export type WeekInfo = { label: string; start: string; dateLabels: Record<DayName, string> }

// Lunes-Domingo de la semana a `offset` semanas de la de `reference` (0 = esta semana, 1 = la que
// viene, -1 = la pasada…) con fechas de verdad.
export function getWeek(offset = 0, reference = new Date()): WeekInfo {
  const monday = mondayOf(reference)
  monday.setDate(monday.getDate() + offset * 7)
  const dateLabels = {} as Record<DayName, string>
  DAY_NAMES.forEach((day, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    dateLabels[day] = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  })
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const start = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  return { label: formatWeekRange(monday, sunday), start, dateLabels }
}

// Texto relativo de una semana respecto a la actual, para el selector de semana del planificador.
export function relativeWeekLabel(offset: number): string {
  if (offset === 0) return 'Esta semana'
  if (offset === 1) return 'La semana que viene'
  if (offset === -1) return 'La semana pasada'
  return offset > 0 ? `Dentro de ${offset} semanas` : `Hace ${-offset} semanas`
}
