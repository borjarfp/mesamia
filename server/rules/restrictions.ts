import type { DayName, Difficulty, MealSlot, RuleViolation } from '../types'
import { WEEKDAYS } from '../types'
import { MAX_WEEKDAY_MINUTES } from './constants'

// Restricciones de ingredientes y de tiempo pedidas por la familia. Se comprueban con código
// determinista (igual que los máximos/mínimos de engine.ts), no confiando en que el LLM las
// respete: en el Paso 2/sustitución sobre el plato planificado (título + ingredientes principales),
// y en el Paso 4 sobre la receta web consolidada (una receta de "paella" de Cookidoo puede traer
// gambas aunque el plato planificado no las mencionara) — ver server/pipeline/step4-consolidate.ts.
//
// Es una heurística de texto por palabras (normaliza acentos/mayúsculas, admite plural en -s/-es),
// no NLP: un ingrediente raro que no esté en estas listas no se detecta. Ampliar las listas si
// aparece alguno.

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Coincidencia por palabra completa, con plural opcional: "gamba" casa con "gambas" y "Gambas al
// ajillo", pero "oliva" NO se usa como término (casaría con "aceite de oliva", que sí está permitido;
// por eso la lista de aceitunas usa "olivas" en plural).
function containsTerm(text: string, term: string): boolean {
  return new RegExp(`(^|[^a-z])${normalize(term)}(s|es)?([^a-z]|$)`).test(normalize(text))
}

function findTerms(texts: string[], terms: readonly string[]): string[] {
  return terms.filter(term => texts.some(text => containsTerm(text, term)))
}

// Marisco (crustáceos y bivalvos). Los cefalópodos NO están aquí: pota, calamar, pulpo y sepia
// están permitidos explícitamente (ver ALLOWED_SEAFOOD).
const SHELLFISH = ['marisco', 'frutos del mar', 'gamba', 'langostino', 'camaron', 'cigala', 'carabinero', 'bogavante', 'langosta', 'cangrejo', 'necora', 'buey de mar', 'centolla', 'percebe', 'mejillon', 'almeja', 'berberecho', 'navaja', 'vieira', 'zamburiña', 'ostra', 'coquina', 'erizo de mar'] as const
const TUNA = ['atun', 'bonito del norte'] as const
const OLIVES = ['aceituna', 'olivas', 'olivada'] as const
// Otros ingredientes que la familia no quiere. Solo champiñones (no todas las setas) y tofu, tal
// como se pidió.
const OTHER_BANNED = ['champiñon', 'tofu'] as const
// Cualquier pescado que no sea merluza o salmón (incluso como ingrediente secundario, p. ej.
// anchoas en una ensalada): "en las recetas de pescado solo pueden ser de merluza y de salmón".
const OTHER_FISH = ['bacalao', 'dorada', 'lubina', 'sardina', 'boqueron', 'anchoa', 'caballa', 'rape', 'lenguado', 'trucha', 'emperador', 'pez espada', 'rodaballo', 'salmonete', 'mero', 'panga', 'tilapia', 'abadejo', 'bacaladilla', 'jurel', 'perca', 'palometa', 'corvina', 'besugo', 'cazon', 'raya', 'arenque', 'lucio'] as const
// Lo único que puede ser la proteína de un plato de categoría "pescado". Pescadilla = merluza
// pequeña; chipirón/choco/puntillita = calamar/sepia pequeños.
const ALLOWED_SEAFOOD = ['merluza', 'pescadilla', 'salmon', 'pota', 'calamar', 'chipiron', 'puntillita', 'pulpo', 'sepia', 'choco'] as const

export type RestrictionSubject = {
  day: DayName
  meal: MealSlot
  title: string
  ingredients: string[]
  proteinCategory: string
  totalTimeMinutes?: number
  difficulty?: Difficulty
}

const isWeekday = (day: DayName) => WEEKDAYS.includes(day)

export function checkDishRestrictions(dish: RestrictionSubject): RuleViolation[] {
  const { day, meal, title } = dish
  const texts = [title, ...dish.ingredients]
  const where = `El plato "${title}" (${day}/${meal})`
  const violations: RuleViolation[] = []

  const shellfish = findTerms(texts, SHELLFISH)
  if (shellfish.length) violations.push({ rule: 'sin_marisco', day, meal, message: `${where} lleva marisco (${shellfish.join(', ')}), que no está permitido. Pota, calamar, pulpo y sepia sí lo están.` })

  const tuna = findTerms(texts, TUNA)
  if (tuna.length) violations.push({ rule: 'sin_atun', day, meal, message: `${where} lleva atún (${tuna.join(', ')}), que no está permitido.` })

  const olives = findTerms(texts, OLIVES)
  if (olives.length) violations.push({ rule: 'sin_aceitunas', day, meal, message: `${where} lleva aceitunas (${olives.join(', ')}), que no están permitidas.` })

  const otherBanned = findTerms(texts, OTHER_BANNED)
  if (otherBanned.length) violations.push({ rule: 'ingrediente_no_permitido', day, meal, message: `${where} lleva ${otherBanned.join(', ')}, que no está permitido (ni champiñones ni tofu).` })

  const otherFish = findTerms(texts, OTHER_FISH)
  if (otherFish.length) violations.push({ rule: 'pescado_no_permitido', day, meal, message: `${where} lleva ${otherFish.join(', ')}; el único pescado permitido es merluza o salmón (o pota, calamar, pulpo, sepia).` })

  if (dish.proteinCategory === 'pescado' && findTerms(texts, ALLOWED_SEAFOOD).length === 0) {
    violations.push({ rule: 'pescado_especie', day, meal, message: `${where} es de pescado pero no dice de cuál: tiene que ser merluza o salmón (o pota, calamar, pulpo, sepia), y nombrarlo en el título o los ingredientes.` })
  }

  if (isWeekday(day)) {
    if (dish.difficulty && dish.difficulty !== 'facil') violations.push({ rule: 'entre_semana_facil', day, meal, message: `${where} es de dificultad "${dish.difficulty}"; de lunes a viernes tiene que ser una receta fácil.` })
    if (dish.totalTimeMinutes !== undefined && dish.totalTimeMinutes > MAX_WEEKDAY_MINUTES) violations.push({ rule: 'entre_semana_tiempo', day, meal, message: `${where} tarda ${dish.totalTimeMinutes} min; de lunes a viernes no puede pasar de ${MAX_WEEKDAY_MINUTES} min en total.` })
  }

  return violations
}
