import { PEOPLE_BY_DAY, peopleLabel } from '../rules/constants'
import { DAY_NAMES, SHOPPING_CATEGORIES, type WeekPlan } from '../types'

export { PEOPLE_BY_DAY }

export function buildShoppingListSystemInstruction(): string {
  return [
    'Eres quien prepara la lista de la compra semanal de una familia a partir de su menú.',
    'Recibes los 14 platos (comida y cena de cada día) con sus ingredientes y las personas que comen en cada uno.',
    'Reglas:',
    '- Calcula la cantidad de cada ingrediente para el número de personas indicado en cada plato (una ración razonable por persona) y suma todas las apariciones del mismo ingrediente en la semana en una sola línea.',
    '- Unifica nombres equivalentes ("cebolla" y "cebolla picada" son una sola línea). Cantidades totales en unidades de compra realistas (g, kg, ml, l, unidades, manojos, latas...).',
    '- No incluyas agua, sal, pimienta ni aceite de oliva: se asume que ya hay en casa. Sí incluye el resto de especias o salsas si el plato las necesita.',
    '- Los ingredientes que YA traen cantidad (recetas de la IA, p. ej. "200 g de lentejas", "1 cebolla") están calculados para las personas indicadas en esa línea: súmalos tal cual, sin volver a escalarlos. Los que llegan sin cantidad: estímalas tú. Si el plato trae su receta o descripción con cantidades (p. ej. "para dos personas"), úsalas como referencia y escálalas a las personas indicadas.',
    '- Los platos escritos a mano pueden llegar SIN lista de ingredientes: entonces saca los ingredientes de su descripción o receta y, si no la hay, de lo que lleva normalmente ese plato. NUNCA añadas el nombre de un plato como si fuera algo que se compra: la lista contiene solo ingredientes y productos.',
    '- PRODUCTOS DE MERCADONA: SOLO si el texto menciona expresamente "Mercadona" (p. ej. "Verduras en tempura de Mercadona"), ese elemento es un producto ya hecho que se compra tal cual en el supermercado. Añádelo como UNA sola línea con el nombre del producto (incluyendo "Mercadona"), con la cantidad en envases o unidades para las personas indicadas, y NO lo descompongas en sus ingredientes (no pongas calabacín, harina, etc. para prepararlo). Si el plato lleva además otros ingredientes normales, esos sí van aparte.',
    `- category debe ser exactamente una de: ${SHOPPING_CATEGORIES.join(', ')}.`,
    '- Escribe todo en español.',
  ].join('\n')
}

export function buildShoppingListUserPrompt(week: WeekPlan): string {
  const lines = DAY_NAMES.flatMap(day => {
    const plan = week.days.find(item => item.day === day)
    if (!plan) return []
    const people = PEOPLE_BY_DAY[day]
    return (['comida', 'cena'] as const).map(meal => {
      const dish = plan[meal]
      // Un plato escrito a mano no trae ingredientes: su receta está en la descripción.
      const detail = dish.ingredients.length > 0 ? dish.ingredients.join(', ') : `no indicados. Descripción/receta: ${dish.description.trim().slice(0, 1500) || 'sin descripción'}`
      return `- ${day} ${meal} (${peopleLabel(people)}): ${dish.title} — ingredientes: ${detail}`
    })
  })
  return ['Menú de la semana:', ...lines, '', 'Genera la lista de la compra.'].join('\n')
}
