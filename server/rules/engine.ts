import type { DayName, PlannedDish, ProteinCategory, RuleViolation, SchoolMenuExtraction } from '../types'
import { WEEKDAYS } from '../types'
import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MIN_LEGUMBRE } from './constants'
import { checkDishRestrictions } from './restrictions'

// Normaliza un ingrediente para comparar de forma tolerante (mayúsculas/acentos/espacios no deben
// importar). Es una heurística de texto, no NLP real: dos ingredientes "coinciden" si, tras
// normalizar, son iguales o uno contiene al otro (para que "pollo" case con "pechuga de pollo").
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function ingredientsOverlap(a: string[], b: string[]): string[] {
  const normalizedB = b.map(normalize)
  const overlaps: string[] = []
  for (const ingredient of a) {
    const normalizedA = normalize(ingredient)
    if (!normalizedA) continue
    const hit = normalizedB.find(candidate => candidate && (candidate === normalizedA || candidate.includes(normalizedA) || normalizedA.includes(candidate)))
    if (hit) overlaps.push(ingredient)
  }
  return overlaps
}

// Ingredientes + categoría de proteína que el colegio/guardería sirve un día dado, unidos entre
// todas las niñas (si Aina e Iria comen algo distinto ese día, se evita lo de ambas).
function schoolContextForDay(schoolMenu: SchoolMenuExtraction, day: DayName): { ingredients: string[]; categories: Set<ProteinCategory> } {
  const entries = schoolMenu.children.flatMap(child => child.meals.filter(meal => meal.day === day))
  return {
    ingredients: entries.flatMap(entry => entry.mainIngredients),
    categories: new Set(entries.map(entry => entry.proteinCategory)),
  }
}

function countByCategory(slots: PlannedDish[], category: ProteinCategory): number {
  return slots.filter(slot => slot.proteinCategory === category).length
}

// Valida un borrador de semana (los 14 huecos planificados: comida+cena de los 7 días) contra las
// reglas del enunciado. Los límites de categoría (huevo/ave/pescado/carne_roja/legumbre) cuentan
// sobre las 14 raciones — incluida la comida de lunes a viernes, que ahora es un plato real para
// los padres, no información del cole. Devuelve la lista de incumplimientos — vacía si todo está
// en regla. No lanza excepciones: es responsabilidad del llamador (server/pipeline/step2) decidir
// qué hacer con las violaciones (reintentar pidiéndole a Gemini que corrija, o devolver el
// resultado con avisos).
export function validateWeekDraft(slots: PlannedDish[], schoolMenu: SchoolMenuExtraction): RuleViolation[] {
  // Restricciones por plato: sin marisco/atún/aceitunas, solo merluza/salmón (+ cefalópodos) como
  // pescado, y recetas fáciles y de ≤ MAX_WEEKDAY_MINUTES de lunes a viernes.
  const violations: RuleViolation[] = slots.flatMap(slot => checkDishRestrictions({ ...slot, ingredients: slot.mainIngredients }))

  for (const day of WEEKDAYS) {
    const dinner = slots.find(slot => slot.day === day && slot.meal === 'cena')
    if (!dinner) continue // el propio orquestador ya garantiza que existan los 14 huecos; defensivo
    const school = schoolContextForDay(schoolMenu, day)

    if (school.categories.has(dinner.proteinCategory)) {
      violations.push({
        rule: 'cena_repite_tipologia_escolar',
        day,
        meal: 'cena',
        message: `La cena del ${day} es de categoría "${dinner.proteinCategory}", la misma que la comida escolar de ese día.`,
      })
    }

    const overlap = ingredientsOverlap(dinner.mainIngredients, school.ingredients)
    if (overlap.length > 0) {
      violations.push({
        rule: 'cena_repite_ingrediente_escolar',
        day,
        meal: 'cena',
        message: `La cena del ${day} repite ingrediente(s) de la comida escolar de ese día: ${overlap.join(', ')}.`,
      })
    }
  }

  const huevo = countByCategory(slots, 'huevo')
  if (huevo > MAX_HUEVO) violations.push({ rule: 'max_huevo', message: `Hay ${huevo} raciones de huevo en la semana; el máximo es ${MAX_HUEVO}.` })

  const ave = countByCategory(slots, 'ave')
  if (ave > MAX_AVE) violations.push({ rule: 'max_ave', message: `Hay ${ave} raciones de ave/pollo en la semana; el máximo es ${MAX_AVE}.` })

  const pescado = countByCategory(slots, 'pescado')
  if (pescado > MAX_PESCADO) violations.push({ rule: 'max_pescado', message: `Hay ${pescado} raciones de pescado en la semana; el máximo es ${MAX_PESCADO}.` })

  const carneRoja = countByCategory(slots, 'carne_roja')
  if (carneRoja > MAX_CARNE_ROJA) violations.push({ rule: 'max_carne_roja', message: `Hay ${carneRoja} raciones de carne roja en la semana; el máximo es ${MAX_CARNE_ROJA}.` })

  const legumbre = countByCategory(slots, 'legumbre')
  if (legumbre < MIN_LEGUMBRE) violations.push({ rule: 'min_legumbre', message: `Solo hay ${legumbre} raciones de legumbres en la semana; el mínimo es ${MIN_LEGUMBRE}.` })

  return violations
}
