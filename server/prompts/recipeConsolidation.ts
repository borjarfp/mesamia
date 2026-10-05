import type { RecipeSearchHit } from '../clients/tavily'
import type { PlannedDish } from '../types'
import { WEEKDAYS } from '../types'
import { PEOPLE_BY_DAY, peopleLabel } from '../rules/constants'
import { FAMILY_RESTRICTION_LINES } from './weekPlanning'

// Paso 4: para UN plato planificado, elegir la mejor receta entre las candidatas web que encontró
// Tavily (páginas reales con todo su ruido: menús, anuncios, comentarios...) y una receta propia de
// Gemini, y devolver la elegida estandarizada (título, descripción, ingredientes, tiempo,
// dificultad). Antes aquí solo se "limpiaba" la primera página que devolviera Tavily, fuera o no el
// plato pedido — por eso casi todo acababa siendo receta web.
export function buildRecipeSelectionSystemInstruction(): string {
  return [
    'Eres quien elige la receta definitiva de cada plato de un menú semanal familiar.',
    'Recibes el plato planificado y entre 0 y 4 recetas web candidatas (contenido bruto de la página). Las opciones son: una de esas candidatas, o "ia" = escribir tú tu propia receta de ese plato.',
    'Las candidatas de Cookidoo son recetas para Thermomix. En esta casa HAY Thermomix y suscripción a Cookidoo, así que son igual de válidas que las demás. Su página pública no muestra los pasos (la familia los ve en su cuenta): NO las descartes ni las penalices por eso.',
    'Una candidata web solo es válida si:',
    '- Es de verdad el plato planificado, o uno equivalente con la misma proteína principal y el mismo estilo. Una receta distinta que solo comparte alguna palabra NO es válida.',
    '- Cumple todas estas restricciones de la familia (revisa la lista completa de ingredientes de la página):',
    ...FAMILY_RESTRICTION_LINES.map(line => `  ${line}`),
    'Entre las opciones válidas (incluida la tuya), elige la mejor para esta familia: la más fiel al plato planificado; con ingredientes claros y habituales en una casa; y, de lunes a viernes, la más sencilla y rápida. No elijas una receta web solo por ser web, ni la tuya solo por ser tuya: quédate con la que sea mejor.',
    'Si no hay candidatas, o ninguna es válida, elige "ia".',
    'Después de elegir, rellena la receta:',
    '- Si eliges una candidata web: describe ESA receta tal cual es, sin inventar ni quitar nada.',
    '- Si eliges "ia": escribe tu propia receta del plato planificado, realista para cocinar en casa.',
    '- title: título corto del plato (sin el nombre del sitio web ni texto de relleno).',
    '- description: una sola frase que resuma el plato de forma atractiva.',
    '- ingredients: la lista COMPLETA de ingredientes, en minúsculas (se usa para comprobar ingredientes no permitidos, no omitas ninguno). Si eliges una candidata web, SIN cantidades. Si eliges "ia", CON la cantidad de cada ingrediente calculada para las personas que se indican en el plato planificado, en el formato "cantidad unidad de ingrediente" ("200 g de lentejas", "1 cebolla", "2 dientes de ajo", "1 cucharada de aceite de oliva", "1 pizca de sal"); cantidades realistas para esa ración y sin repetir ingredientes. Los pasos de tu receta también deben corresponder a esas cantidades.',
    '- steps: de 3 a 6 pasos breves (una frase cada uno) de cómo se hace, en orden. Si es web, resume fielmente los pasos de la página; si es "ia", los de tu receta. Si eliges una de Cookidoo (sin pasos en la página), devuelve steps vacío: no te inventes los pasos de una receta de Thermomix.',
    '- totalTimeMinutes: tiempo total en minutos (el que indique la página si es web; si no lo indica, estímalo de forma realista).',
    '- difficulty: facil, media o dificil (ídem).',
    'Devuelve exclusivamente el JSON solicitado.',
  ].join('\n')
}

// Recorte por candidata: el contenido de una página puede ser muy largo, y con hasta 3 por plato
// hay que acotar el coste/latencia de la llamada. Con esto cabe lo esencial (ingredientes, tiempo).
const MAX_CANDIDATE_CHARS = 3500

export function buildRecipeSelectionUserPrompt(dish: PlannedDish, candidates: RecipeSearchHit[]): string {
  const when = WEEKDAYS.includes(dish.day) ? 'de lunes a viernes: tiene que ser fácil y rápida' : 'fin de semana: sin límite de tiempo ni dificultad'
  const parts = [
    `Plato planificado: "${dish.title}" (${dish.day}, ${dish.meal} — ${when}). Personas que comen: ${peopleLabel(PEOPLE_BY_DAY[dish.day])}.`,
    `Ingredientes principales previstos: ${dish.mainIngredients.join(', ')}. Categoría de proteína: ${dish.proteinCategory}.`,
  ]
  if (candidates.length === 0) {
    parts.push('No se ha encontrado ninguna receta web para este plato: elige "ia" y escribe tu propia receta.')
  } else {
    candidates.forEach((candidate, index) => {
      const content = candidate.content.length > MAX_CANDIDATE_CHARS ? `${candidate.content.slice(0, MAX_CANDIDATE_CHARS)}…` : candidate.content
      parts.push(`--- Candidata ${index + 1} (${candidate.sourceName}, ${candidate.url}) ---\n${content}`)
    })
  }
  return parts.join('\n\n')
}
