import type { DayName, SchoolMenuExtraction } from '../types'
import { WEEKDAYS } from '../types'

// El menú escolar de un día, en texto para el LLM: qué come cada hijo o hija (con su proteína e
// ingredientes, que es lo que usa el motor de reglas) y la "proposta de sopar" si la hay. Lo usan
// tanto la planificación de la semana como la sustitución de un plato, para que las dos vean
// exactamente lo mismo.
export function formatSchoolDay(schoolMenu: SchoolMenuExtraction, day: DayName): string {
  const lines = schoolMenu.children.flatMap(child => child.meals.filter(meal => meal.day === day).map(meal => {
    const lunch = `- ${child.child} come en el cole: "${meal.title}" (${meal.proteinCategory}; ${meal.mainIngredients.join(', ')}).`
    return meal.dinnerSuggestion ? `${lunch} Propuesta de cena del cole: "${meal.dinnerSuggestion}".` : lunch
  }))
  return lines.length > 0 ? `${day}:\n${lines.join('\n')}` : `${day}: sin menú escolar.`
}

export function formatSchoolWeek(schoolMenu: SchoolMenuExtraction): string {
  return WEEKDAYS.map(day => formatSchoolDay(schoolMenu, day)).join('\n')
}

// Cómo tiene que usar el menú escolar la IA. Compartido por planificación y sustitución. Vale para cualquier número
// de hijos e hijas (cada familia tiene los suyos): la comida de los adultos se parece a la del PRIMERO de la lista
// (el planificador sube los menús en el orden de los hijos e hijas de la familia), la propuesta de cena la trae
// cualquiera de los menús y la regla de no repetir cuenta lo que comen todos.
export const SCHOOL_CONTEXT_LINES = [
  '- Comida de lunes a viernes (para los adultos): que se PAREZCA a lo que comen los niños ese día en el cole: el mismo tipo de plato o de proteína principal (si comen lentejas, un plato de legumbre; si comen merluza, un pescado), en versión para adultos. No tiene por qué ser el mismo plato exacto. Si hay varios niños con menús distintos, toma como referencia el del primero de la lista. Si ese día no hay menú escolar, propón un plato de adultos normal.',
  '- Cena de lunes a viernes: inspírate en la "propuesta de cena" que traiga el menú escolar de ese día, si la hay: la diseña el cole para complementar su comida. Es una sugerencia, no una obligación: adáptala a la familia, o propón otra cosa si encaja mejor con las reglas o con los gustos del historial.',
  '- Ninguna cena de lunes a viernes puede repetir la categoría de proteína ni los ingredientes principales de lo que comen los niños en el cole ese mismo día (todos ellos). Esta regla es obligatoria y va por encima de la propuesta de cena. NO aplica a la comida de los adultos, que precisamente se parece a la del cole.',
]
