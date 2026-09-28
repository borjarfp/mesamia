import type { DayName, SchoolMenuExtraction } from '../types'
import { WEEKDAYS } from '../types'

// La niña cuyo menú marca el estilo de la comida de los adultos y cuya "proposta de sopar" inspira
// la cena (a petición: "tener en cuenta la propuesta de cena que dice el menú de Aina y también la
// comida que va a tener ella para tener cosas semejantes"). Iria va a la guardería y su menú solo
// cuenta para la regla de no repetir en la cena.
export const REFERENCE_CHILD = 'Aina'

// El menú escolar de un día, en texto para el LLM: qué come cada niña (con su proteína e
// ingredientes, que es lo que usa el motor de reglas) y la "proposta de sopar" si la hay. Lo usan
// tanto la planificación de la semana como la sustitución de un plato, para que las dos vean
// exactamente lo mismo.
export function formatSchoolDay(schoolMenu: SchoolMenuExtraction, day: DayName): string {
  const lines = schoolMenu.children.flatMap(child => child.meals.filter(meal => meal.day === day).map(meal => {
    const lunch = `- ${child.child} come en el cole: "${meal.title}" (${meal.proteinCategory}; ${meal.mainIngredients.join(', ')}).`
    return meal.dinnerSuggestion ? `${lunch} Proposta de sopar del cole: "${meal.dinnerSuggestion}".` : lunch
  }))
  return lines.length > 0 ? `${day}:\n${lines.join('\n')}` : `${day}: sin menú escolar.`
}

export function formatSchoolWeek(schoolMenu: SchoolMenuExtraction): string {
  return WEEKDAYS.map(day => formatSchoolDay(schoolMenu, day)).join('\n')
}

// Cómo tiene que usar el menú escolar la IA. Compartido por planificación y sustitución.
export const SCHOOL_CONTEXT_LINES = [
  `- Comida de lunes a viernes (para los adultos): que se PAREZCA a lo que come ${REFERENCE_CHILD} ese día en el cole: el mismo tipo de plato o de proteína principal (si ${REFERENCE_CHILD} come lentejas, un plato de legumbre; si come merluza, un pescado), en versión para adultos. No tiene por qué ser el mismo plato exacto. Si ese día no hay menú de ${REFERENCE_CHILD}, propón un plato de adultos normal.`,
  `- Cena de lunes a viernes: inspírate en la "proposta de sopar" del menú de ${REFERENCE_CHILD} para ese día, si la hay: la diseña el cole para complementar su comida. Es una sugerencia, no una obligación: adáptala a la familia, o propón otra cosa si encaja mejor con las reglas o con los gustos del historial.`,
  '- Ninguna cena de lunes a viernes puede repetir la categoría de proteína ni los ingredientes principales de lo que comen las niñas en el cole ese mismo día. Esta regla es obligatoria y va por encima de la "proposta de sopar". NO aplica a la comida de los adultos, que precisamente se parece a la del cole.',
]
