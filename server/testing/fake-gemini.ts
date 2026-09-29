import type { z } from 'zod'
import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MAX_WEEKDAY_MINUTES, MIN_LEGUMBRE } from '../rules/constants'
import {
  AlternativesDraftSchema,
  ChildSchoolMenuSchema,
  PLANNED_SLOTS,
  RecipeSelectionSchema,
  WEEKDAYS,
  WeekPlanDraftSchema,
  type AlternativeDish,
  type DayName,
  type Difficulty,
  type MealSlot,
  type PlannedDish,
  type ProteinCategory,
  type SchoolMealEntry,
  type WeekPlan,
} from '../types'

// Gemini de mentira para el modo pruebas (server/test-mode.ts): devuelve datos de prueba con la
// misma forma que Gemini, sin llamar a nadie. Se elige qué devolver según el esquema pedido, que es
// lo único que distingue las 4 llamadas del pipeline.
//
// Los datos NO son aleatorios: el planificador de mentira arma semanas que cumplen las reglas
// (mínimo de legumbres, máximos, ≤ 50 min y fácil de lunes a viernes, cena sin repetir lo del cole),
// porque si no el motor de reglas las rechazaría y no se podría probar nada. El resto del pipeline
// (reintentos, validación, elección de receta, ensamblado) corre igual que con Gemini de verdad.
//
// La información que necesita (día a sustituir, menú escolar, semana actual...) la saca del propio
// prompt, cuyo formato es de este mismo repo (server/prompts/*). Si se cambia ese formato, revisar
// los regex de aquí.

type FakeDish = { title: string; mainIngredients: string[]; proteinCategory: ProteinCategory; totalTimeMinutes: number; difficulty: Difficulty }
const dish = (title: string, mainIngredients: string[], proteinCategory: ProteinCategory, totalTimeMinutes: number, difficulty: Difficulty = 'facil'): FakeDish => ({ title, mainIngredients, proteinCategory, totalTimeMinutes, difficulty })

// Platos de prueba por categoría. Todos cumplen las restricciones de la familia (sin marisco, atún,
// aceitunas, champiñones ni tofu; pescado solo merluza/salmón/cefalópodos) y, salvo los marcados
// como de fin de semana (> 50 min o "media"), valen para cualquier día.
const POOL: Record<ProteinCategory, FakeDish[]> = {
  legumbre: [
    dish('Lentejas estofadas con verduras', ['lentejas', 'zanahoria'], 'legumbre', 40),
    dish('Garbanzos salteados con espinacas', ['garbanzos', 'espinacas'], 'legumbre', 25),
    dish('Ensalada de alubias blancas', ['alubias blancas', 'pimiento'], 'legumbre', 15),
    dish('Hamburguesas de garbanzos', ['garbanzos', 'cebolla'], 'legumbre', 30),
    dish('Crema de lentejas rojas', ['lentejas rojas', 'calabaza'], 'legumbre', 30),
    dish('Fabada ligera', ['alubias', 'pimentón'], 'legumbre', 90, 'media'),
  ],
  ave: [
    dish('Pollo al horno con patatas', ['pollo', 'patata'], 'ave', 45),
    dish('Pechuga de pavo a la plancha con ensalada', ['pavo', 'lechuga'], 'ave', 20),
    dish('Brochetas de pollo con pimientos', ['pollo', 'pimiento'], 'ave', 25),
  ],
  pescado: [
    dish('Merluza a la plancha con ensalada', ['merluza', 'lechuga'], 'pescado', 20),
    dish('Salmón al horno con calabacín', ['salmón', 'calabacín'], 'pescado', 30),
    dish('Sepia a la plancha con ajo y perejil', ['sepia', 'ajo'], 'pescado', 20),
    dish('Calamares encebollados', ['calamar', 'cebolla'], 'pescado', 35),
  ],
  huevo: [
    dish('Tortilla de calabacín', ['huevo', 'calabacín'], 'huevo', 25),
    dish('Revuelto de espinacas', ['huevo', 'espinacas'], 'huevo', 15),
    dish('Tortilla francesa con tomate', ['huevo', 'tomate'], 'huevo', 10),
  ],
  carne_roja: [
    dish('Albóndigas de ternera en salsa', ['ternera', 'cebolla'], 'carne_roja', 45),
    dish('Ternera guisada con verduras', ['ternera', 'zanahoria'], 'carne_roja', 90, 'media'),
  ],
  otro: [
    dish('Pasta con tomate y albahaca', ['pasta', 'tomate'], 'otro', 20),
    dish('Crema de calabacín con queso', ['calabacín', 'queso'], 'otro', 25),
    dish('Arroz salteado con verduras', ['arroz', 'pimiento'], 'otro', 25),
    dish('Pizza casera de verduras', ['masa de pizza', 'pimiento'], 'otro', 40),
    dish('Paella de verduras', ['arroz', 'judías verdes'], 'otro', 60, 'media'),
  ],
}
const ALL_DISHES = Object.values(POOL).flat()
const MAX: Partial<Record<ProteinCategory, number>> = { huevo: MAX_HUEVO, ave: MAX_AVE, pescado: MAX_PESCADO, carne_roja: MAX_CARNE_ROJA }

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const overlaps = (a: string[], b: string[]) => a.some(x => b.some(y => normalize(x).includes(normalize(y)) || normalize(y).includes(normalize(x))))
const isWeekday = (day: DayName) => WEEKDAYS.includes(day)
const fitsDay = (candidate: FakeDish, day: DayName) => !isWeekday(day) || (candidate.difficulty === 'facil' && candidate.totalTimeMinutes <= MAX_WEEKDAY_MINUTES)

// --- Lectura del prompt ---------------------------------------------------------------------------

type SchoolDay = { child: string; category: ProteinCategory; ingredients: string[] }

// Bloques de server/prompts/schoolContext.ts → formatSchoolDay: "lunes:\n- Aina come en el cole: "X" (legumbre; lentejas, zanahoria)."
function parseSchoolDays(prompt: string): Map<DayName, SchoolDay[]> {
  const days = new Map<DayName, SchoolDay[]>()
  let current: DayName | null = null
  for (const line of prompt.split('\n')) {
    const header = line.match(/^(lunes|martes|miercoles|jueves|viernes):/)
    if (header) { current = header[1] as DayName; days.set(current, []); continue }
    const meal = line.match(/^- (.+?) come en el cole: ".*?" \((\w+); (.*?)\)\./)
    if (current && meal) days.get(current)!.push({ child: meal[1], category: meal[2] as ProteinCategory, ingredients: meal[3].split(', ') })
  }
  return days
}

const avoidsSchool = (candidate: FakeDish, school: SchoolDay[] = []) =>
  !school.some(entry => entry.category === candidate.proteinCategory) && !overlaps(candidate.mainIngredients, school.flatMap(entry => entry.ingredients))

// --- Planificación de la semana ------------------------------------------------------------------

function fakeWeekPlan(prompt: string): z.infer<typeof WeekPlanDraftSchema> {
  const school = parseSchoolDays(prompt)
  const counts: Partial<Record<ProteinCategory, number>> = {}
  const used = new Set<string>()
  const slots: PlannedDish[] = []
  // Orden: comidas L-V, cenas L-V y el fin de semana al final, que no tiene restricciones y sirve
  // para completar las legumbres que falten.
  const order = [...WEEKDAYS.map(day => ({ day, meal: 'comida' as MealSlot })), ...WEEKDAYS.map(day => ({ day, meal: 'cena' as MealSlot })), ...PLANNED_SLOTS.filter(slot => !isWeekday(slot.day))]
  order.forEach(({ day, meal }, index) => {
    const remainingAfter = order.length - index - 1
    const legumesNeeded = MIN_LEGUMBRE - (counts.legumbre ?? 0)
    const mustBeLegume = legumesNeeded > remainingAfter
    // La comida L-V imita la categoría de lo que come Aina (o la primera niña) ese día, como pide
    // SCHOOL_CONTEXT_LINES; la cena prueba primero legumbre/pescado/huevo.
    const lunchCategory = meal === 'comida' ? school.get(day)?.find(entry => entry.child === 'Aina')?.category ?? school.get(day)?.[0]?.category : undefined
    const preference: ProteinCategory[] = mustBeLegume ? ['legumbre'] : [...(lunchCategory ? [lunchCategory] : []), 'legumbre', 'pescado', 'huevo', 'ave', 'otro', 'carne_roja']
    const candidate = preference.flatMap(category => POOL[category]).find(option =>
      !used.has(option.title) && fitsDay(option, day) && (counts[option.proteinCategory] ?? 0) < (MAX[option.proteinCategory] ?? Infinity) &&
      (meal === 'comida' || !isWeekday(day) || avoidsSchool(option, school.get(day))))
      ?? POOL.otro.find(option => !used.has(option.title) && fitsDay(option, day))!
    used.add(candidate.title)
    counts[candidate.proteinCategory] = (counts[candidate.proteinCategory] ?? 0) + 1
    slots.push({ day, meal, ...candidate, rationale: 'Plato de prueba (modo pruebas, sin IA).' })
  })
  return { slots }
}

// --- Alternativas para un hueco ------------------------------------------------------------------

let alternativesCall = 0

function fakeAlternatives(prompt: string, count: number): z.infer<typeof AlternativesDraftSchema> {
  const slot = prompt.match(/Hueco a sustituir: (\w+) \/ (\w+)\./)
  const day = (slot?.[1] ?? 'lunes') as DayName
  const meal = (slot?.[2] ?? 'cena') as MealSlot
  const weekJson = prompt.split('\n\n').find(part => part.trimStart().startsWith('{'))
  const week: WeekPlan | null = weekJson ? JSON.parse(weekJson) : null
  const others = (week?.days ?? []).flatMap(plan => (['comida', 'cena'] as const).filter(slotMeal => !(plan.day === day && slotMeal === meal)).map(slotMeal => plan[slotMeal]))
  const counts: Partial<Record<ProteinCategory, number>> = {}
  others.forEach(item => { counts[item.proteinCategory] = (counts[item.proteinCategory] ?? 0) + 1 })
  const inWeek = new Set((week?.days ?? []).flatMap(plan => [plan.comida.title, plan.cena.title]))
  const mustBeLegume = (counts.legumbre ?? 0) < MIN_LEGUMBRE
  const school = parseSchoolDays(prompt).get(day)
  const valid = ALL_DISHES.filter(option =>
    !inWeek.has(option.title) && fitsDay(option, day) && (counts[option.proteinCategory] ?? 0) < (MAX[option.proteinCategory] ?? Infinity) &&
    (!mustBeLegume || option.proteinCategory === 'legumbre') && (meal === 'comida' || !isWeekday(day) || avoidsSchool(option, school)))
  // Cada llamada avanza la ventana `count` posiciones, para que "Buscar otras alternativas" dé
  // otras distintas (mientras haya suficientes platos válidos para ese hueco).
  const start = (alternativesCall++ * count) % Math.max(valid.length, 1)
  const picked = [...valid.slice(start), ...valid.slice(0, start)].slice(0, count)
  const alternatives: AlternativeDish[] = picked.map(option => ({ ...option, rationale: 'Alternativa de prueba (modo pruebas, sin IA).' }))
  return { alternatives }
}

// --- Extracción del menú escolar -----------------------------------------------------------------

const FAKE_SCHOOL: Record<string, Array<Omit<SchoolMealEntry, 'day'>>> = {
  Aina: [
    { title: 'Llenties estofades amb verdures', mainIngredients: ['lentejas', 'zanahoria'], proteinCategory: 'legumbre', dinnerSuggestion: 'Truita de carbassó i amanida de tomàquet' },
    { title: 'Arròs amb pollastre', mainIngredients: ['arroz', 'pollo'], proteinCategory: 'ave', dinnerSuggestion: 'Salmó a la planxa amb verdures al vapor' },
    { title: 'Lluç al forn amb patates', mainIngredients: ['merluza', 'patata'], proteinCategory: 'pescado', dinnerSuggestion: 'Cigrons saltejats amb espinacs' },
    { title: 'Truita de patates', mainIngredients: ['huevo', 'patata'], proteinCategory: 'huevo', dinnerSuggestion: 'Crema de verdures i pollastre al forn' },
    { title: 'Macarrons amb tomàquet', mainIngredients: ['pasta', 'tomate'], proteinCategory: 'otro', dinnerSuggestion: 'Lluç amb mongeta tendra' },
  ],
  Iria: [
    { title: 'Puré de verduras con pollo', mainIngredients: ['verduras', 'pollo'], proteinCategory: 'ave' },
    { title: 'Crema de calabaza', mainIngredients: ['calabaza'], proteinCategory: 'otro' },
    { title: 'Puré de lentejas', mainIngredients: ['lentejas'], proteinCategory: 'legumbre' },
    { title: 'Puré de merluza y patata', mainIngredients: ['merluza', 'patata'], proteinCategory: 'pescado' },
    { title: 'Tortilla francesa con verduras', mainIngredients: ['huevo', 'verduras'], proteinCategory: 'huevo' },
  ],
}

function fakeSchoolMenu(prompt: string): z.infer<typeof ChildSchoolMenuSchema> {
  const child = prompt.match(/El campo "child" de tu respuesta debe ser exactamente "(.+?)"/)?.[1] ?? 'Aina'
  const meals = (FAKE_SCHOOL[child] ?? FAKE_SCHOOL.Aina.map(({ dinnerSuggestion: _unused, ...meal }) => meal)).map((meal, index) => ({ day: WEEKDAYS[index], ...meal }))
  // Fechas = la semana que se planifica, para que no salte el aviso de "no coincide".
  const week = prompt.match(/semana del lunes (\d{4}-\d{2}-\d{2}) al viernes (\d{4}-\d{2}-\d{2})/)
  return { child, meals, ...(week ? { menuStartDate: week[1], menuEndDate: week[2] } : {}) }
}

// --- Elección de receta --------------------------------------------------------------------------

function fakeRecipeSelection(prompt: string): z.infer<typeof RecipeSelectionSchema> {
  const title = prompt.match(/Plato planificado: "(.+?)" \((\w+),/)
  const day = (title?.[2] ?? 'sabado') as DayName
  const ingredients = prompt.match(/Ingredientes principales previstos: (.*?)\. Categoría/)?.[1].split(', ') ?? []
  const candidates = [...prompt.matchAll(/--- Candidata (\d+) \((.+?), /g)]
  // Reparte según el título entre receta propia, la primera candidata (Cookpad) y la última
  // (Cookidoo, que va al final), para que en pruebas salgan los tres caminos — incluido el de
  // Cookidoo sin pasos + enlace "Ver los pasos en Cookidoo".
  const hash = [...(title?.[1] ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const picked = hash % 3 === 0 || candidates.length === 0 ? null : hash % 3 === 1 ? candidates[0] : candidates[candidates.length - 1]
  const choice = (picked?.[1] ?? 'ia') as z.infer<typeof RecipeSelectionSchema>['choice']
  return {
    choice,
    reason: 'Elección de prueba (modo pruebas, sin IA).',
    title: title?.[1] ?? 'Plato de prueba',
    description: 'Receta de prueba generada sin IA para seguir desarrollando.',
    ingredients: [...ingredients, 'aceite de oliva', 'sal'],
    steps: ['Prepara y corta los ingredientes.', 'Cocina a fuego medio hasta que esté listo.', 'Sirve y ajusta de sal al gusto.'],
    totalTimeMinutes: isWeekday(day) ? 25 : 45,
    difficulty: 'facil',
  }
}

// --- Punto de entrada ----------------------------------------------------------------------------

// Un pequeño retraso para que en pruebas se vean los estados de carga (spinner, barra de progreso).
const FAKE_LATENCY_MS = 400

export async function fakeGenerateStructured(schema: z.ZodType, systemInstruction: string | undefined, prompt: string): Promise<unknown> {
  await new Promise(resolve => setTimeout(resolve, FAKE_LATENCY_MS))
  if (schema === ChildSchoolMenuSchema) return fakeSchoolMenu(prompt)
  if (schema === WeekPlanDraftSchema) return fakeWeekPlan(prompt)
  if (schema === AlternativesDraftSchema) return fakeAlternatives(prompt, Number(systemInstruction?.match(/exactamente (\d+) alternativas/)?.[1] ?? 3))
  if (schema === RecipeSelectionSchema) return fakeRecipeSelection(prompt)
  throw new Error('Modo pruebas: no hay datos de prueba para este esquema de Gemini. Añádelos en server/testing/fake-gemini.ts.')
}
