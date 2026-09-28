import type { SchoolMenuExtraction } from '@/server/types'
import { formatIsoRange, parseIsoDate, toIsoDate } from '@/lib/week-dates'

export type SchoolMenuDateCheck = {
  // Menús cuyas fechas no caen en la semana planificada (lunes a viernes).
  mismatched: Array<{ child: string; range: string }>
  // Menús sin fechas en el documento: no se puede comprobar.
  unknown: string[]
}

// ¿El menú escolar que se subió es de la semana que se está planificando? Las fechas las lee Gemini
// en el Paso 1 (menuStartDate/menuEndDate), pero la comparación es código, aquí: un menú coincide si
// su rango se solapa con el lunes-viernes de `weekStart`. Si solo hay fecha de inicio, se asume una
// semana escolar (5 días). Es una función pura, así que el planificador la recalcula en vivo si se
// cambia de semana con las flechas después de generar.
export function checkSchoolMenuDates(schoolMenu: SchoolMenuExtraction, weekStart: string): SchoolMenuDateCheck {
  const friday = parseIsoDate(weekStart)
  friday.setDate(friday.getDate() + 4)
  const weekEnd = toIsoDate(friday)
  const check: SchoolMenuDateCheck = { mismatched: [], unknown: [] }
  for (const child of schoolMenu.children) {
    if (child.meals.length === 0) continue
    if (!child.menuStartDate && !child.menuEndDate) { check.unknown.push(child.child); continue }
    const start = child.menuStartDate ?? child.menuEndDate!
    let end = child.menuEndDate
    if (!end) { const date = parseIsoDate(start); date.setDate(date.getDate() + 4); end = toIsoDate(date) }
    const overlaps = start <= weekEnd && end >= weekStart
    if (!overlaps) check.mismatched.push({ child: child.child, range: formatIsoRange(start, end) })
  }
  return check
}
