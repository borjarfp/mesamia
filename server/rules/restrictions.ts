import type { DayName, Difficulty, MealSlot, RuleViolation } from '../types'
import { WEEKDAYS } from '../types'
import { classifyCustomWords, FISH_CATALOG, isDefaultFishSelection, MEAT_CATALOG, type AliasGroup, type FamilyRules } from './family-rules'

// Restricciones de ingredientes y de tiempo de CADA familia (FamilyRules.ingredients / weekday). Se comprueban con código
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
  // El término puede venir escrito por el usuario (palabras propias de la familia): se escapa para
  // que un carácter especial no rompa la expresión ni abra la puerta a un ReDoS.
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z])${escaped}(s|es)?([^a-z]|$)`).test(normalize(text))
}

function findTerms(texts: string[], terms: readonly string[]): string[] {
  return terms.filter(term => texts.some(text => containsTerm(text, term)))
}

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

// Los pescados prohibidos se listan en este orden (el de siempre), para que el mensaje salga igual que antes
// de que las reglas fueran por familia cuando un plato lleva varios.
const FISH_TERM_ORDER = ['bacalao', 'dorada', 'lubina', 'sardina', 'boqueron', 'anchoa', 'caballa', 'rape', 'lenguado', 'trucha', 'emperador', 'pez espada', 'rodaballo', 'salmonete', 'mero', 'panga', 'tilapia', 'abadejo', 'bacaladilla', 'jurel', 'perca', 'palometa', 'corvina', 'besugo', 'cazon', 'raya', 'arenque', 'lucio']
const orderIndex = (term: string) => { const index = FISH_TERM_ORDER.indexOf(term); return index === -1 ? FISH_TERM_ORDER.length : index }

// Mensaje y código de cada grupo de "Otros ingredientes" conocido (los mismos de siempre).
const GROUP_RULE: Record<AliasGroup, string> = { marisco: 'sin_marisco', atun: 'sin_atun', aceitunas: 'sin_aceitunas', champi_tofu: 'ingrediente_no_permitido' }
function groupMessage(group: AliasGroup, where: string, found: string[], bothMushroomsAndTofu: boolean): string {
  if (group === 'marisco') return `${where} lleva marisco (${found.join(', ')}), que no está permitido. Pota, calamar, pulpo y sepia sí lo están.`
  if (group === 'atun') return `${where} lleva atún (${found.join(', ')}), que no está permitido.`
  if (group === 'aceitunas') return `${where} lleva aceitunas (${found.join(', ')}), que no están permitidas.`
  return `${where} lleva ${found.join(', ')}, que no está permitido${bothMushroomsAndTofu ? ' (ni champiñones ni tofu)' : ''}.`
}

// Pescado o carne limitados a unos tipos (el caso genérico): cualquier tipo no permitido que aparezca,
// también como ingrediente secundario, es una violación, y un plato de esa categoría tiene que nombrar uno de
// los permitidos. `catalog` es FISH_CATALOG o MEAT_CATALOG.
function checkLimitedKind(args: { catalog: ReadonlyArray<{ key: string; label: string; terms: readonly string[] }>; allowedKeys: readonly string[]; categories: readonly string[]; texts: string[]; dish: RestrictionSubject; where: string; onlyAllowed: string; none: string; forbiddenRule: string; namedRule: string; sortTerms?: (a: string, b: string) => number; legacy?: { forbidden: string; named: string } }): RuleViolation[] {
  const { catalog, allowedKeys, categories, texts, dish, where, onlyAllowed, none, forbiddenRule, namedRule, sortTerms, legacy } = args
  const { day, meal } = dish
  const allowed = catalog.filter(kind => allowedKeys.includes(kind.key))
  const allowedList = allowed.map(kind => kind.label).join('; ') || 'ninguno'
  const violations: RuleViolation[] = []
  const forbiddenTerms = catalog.filter(kind => !allowed.includes(kind)).flatMap(kind => [...kind.terms])
  const forbidden = findTerms(texts, sortTerms ? forbiddenTerms.sort(sortTerms) : forbiddenTerms)
  if (forbidden.length) violations.push({ rule: forbiddenRule, day, meal, message: legacy ? `${where} lleva ${forbidden.join(', ')}; ${legacy.forbidden}` : `${where} lleva ${forbidden.join(', ')}; ${onlyAllowed}: ${allowedList}.` })
  if (categories.includes(dish.proteinCategory)) {
    if (allowed.length === 0) violations.push({ rule: namedRule, day, meal, message: `${where} es de ${dish.proteinCategory}, pero esta familia no admite ${none}.` })
    else if (findTerms(texts, allowed.flatMap(kind => [...kind.terms])).length === 0) violations.push({ rule: namedRule, day, meal, message: legacy ? `${where} ${legacy.named}` : `${where} es de ${dish.proteinCategory} pero no dice de cuál: tiene que ser uno de los permitidos (${allowedList}) y nombrarse en el título o los ingredientes.` })
  }
  return violations
}

// Orden de las comprobaciones (el de siempre, porque es el que ve Gemini al reintentar): marisco, atún,
// aceitunas, champiñones/tofu, pescado, carne, otros ingredientes, y lo de lunes a viernes.
export function checkDishRestrictions(dish: RestrictionSubject, rules: FamilyRules): RuleViolation[] {
  const { day, meal, title } = dish
  const { ingredients, weekday } = rules
  const texts = [title, ...dish.ingredients]
  const where = `El plato "${title}" (${day}/${meal})`
  const violations: RuleViolation[] = []
  const custom = classifyCustomWords(ingredients.custom)

  // "Otros ingredientes que no quieres" conocidos: marisco, atún, aceitunas, champiñones y tofu.
  for (const group of custom.groups) {
    const found = findTerms(texts, group.terms)
    if (found.length) violations.push({ rule: GROUP_RULE[group.group], day, meal, message: groupMessage(group.group, where, found, group.aliases.length === 2) })
  }

  if (ingredients.restrictFish) {
    const isDefault = isDefaultFishSelection(ingredients.allowedFish)
    violations.push(...checkLimitedKind({
      catalog: FISH_CATALOG, allowedKeys: ingredients.allowedFish, categories: ['pescado'], texts, dish, where, onlyAllowed: 'los únicos pescados permitidos son', none: 'ningún pescado', forbiddenRule: 'pescado_no_permitido', namedRule: 'pescado_especie',
      ...(isDefault ? { sortTerms: (a: string, b: string) => orderIndex(a) - orderIndex(b), legacy: { forbidden: 'el único pescado permitido es merluza o salmón (o pota, calamar, pulpo, sepia).', named: `es de pescado pero no dice de cuál: tiene que ser merluza o salmón (o pota, calamar, pulpo, sepia), y nombrarlo en el título o los ingredientes.` } } : {}),
    }))
  }
  if (ingredients.restrictMeat) {
    violations.push(...checkLimitedKind({ catalog: MEAT_CATALOG, allowedKeys: ingredients.allowedMeat, categories: ['ave', 'carne_roja'], texts, dish, where, onlyAllowed: 'las únicas carnes permitidas son', none: 'ninguna carne', forbiddenRule: 'carne_no_permitida', namedRule: 'carne_tipo' }))
  }

  // Cualquier otra palabra de la familia, buscada tal cual.
  for (const word of custom.others) {
    const found = findTerms(texts, [word])
    if (found.length) violations.push({ rule: 'ingrediente_no_permitido', day, meal, message: `${where} lleva ${found.join(', ')}, que esta familia no quiere.` })
  }

  if (isWeekday(day)) {
    if (weekday.onlyEasy && dish.difficulty && dish.difficulty !== 'facil') violations.push({ rule: 'entre_semana_facil', day, meal, message: `${where} es de dificultad "${dish.difficulty}"; de lunes a viernes tiene que ser una receta fácil.` })
    if (dish.totalTimeMinutes !== undefined && weekday.maxMinutes !== null && dish.totalTimeMinutes > weekday.maxMinutes) violations.push({ rule: 'entre_semana_tiempo', day, meal, message: `${where} tarda ${dish.totalTimeMinutes} min; de lunes a viernes no puede pasar de ${weekday.maxMinutes} min en total.` })
  }

  return violations
}
