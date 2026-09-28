import { PROTEIN_CATEGORIES } from '../types'

// Paso 1: instrucción de sistema para extraer/estructurar los menús escolares subidos como
// PDF/imagen. Un único prompt sirve para cualquier combinación de documentos (uno o varios niños,
// uno o varios documentos por niño) — quién es cada documento se indica aparte, por archivo.
export function buildSchoolExtractionSystemInstruction(): string {
  return [
    'Eres un asistente que extrae menús escolares de comedor/guardería a partir de documentos PDF o imágenes.',
    'Para cada documento recibido, identifica el menú de cada día lectivo (normalmente de lunes a viernes) que contenga.',
    'Para cada día y plato, extrae:',
    '- day: el día de la semana en minúsculas y sin acentos (lunes, martes, miercoles, jueves, viernes; ignora fines de semana si aparecen).',
    '- title: el nombre del plato tal como aparece, resumido si es muy largo.',
    '- mainIngredients: los ingredientes principales (proteína y acompañamiento principal), en minúsculas, sin adjetivos ni cantidades. 2-4 ingredientes basta.',
    `- proteinCategory: una de estas categorías, la que mejor describa la proteína principal del plato: ${PROTEIN_CATEGORIES.join(', ')}. Usa "otro" si no aplica ninguna (p. ej. un plato vegetal sin legumbre, o un postre).`,
    'Si un documento menciona varios platos por día (primero y segundo, o comida y merienda), quédate solo con el plato principal de mediodía.',
    '- dinnerSuggestion: si el menú trae para ese día una propuesta de cena ("proposta de sopar", "sopar", "propuesta de cena", "per sopar"...), cópiala tal cual (en el idioma original, sin traducir). Si no trae ninguna, omite el campo: no la inventes.',
    'Fechas: si el documento indica a qué fechas corresponde el menú ("Setmana del 5 al 9 d\'octubre", fechas por día, "Semana 2 de octubre"...), rellena menuStartDate y menuEndDate (YYYY-MM-DD) con el primer y el último día del menú que extraes. Si no indica año, usa el año de la semana que se está planificando (se te indica). Si el documento no indica ninguna fecha, omite los dos campos: no las deduzcas ni las inventes.',
    'Si el documento trae varias semanas (p. ej. un menú mensual), extrae SOLO la semana que corresponde a las fechas que se están planificando (se te indican). Si ninguna coincide, extrae la primera semana que aparezca y pon sus fechas reales.',
    'Devuelve exclusivamente el JSON solicitado, sin texto adicional.',
  ].join('\n')
}

// El nombre de la niña no se puede fiar a que el propio documento lo mencione con claridad; el
// cliente indica a qué niña pertenece cada archivo subido, y aquí se lo recordamos a Gemini para
// que etiquete correctamente el resultado de ese documento en concreto.
// `weekStart` (YYYY-MM-DD, lunes de la semana que se planifica): para elegir la semana correcta de
// un menú mensual y deducir el año de fechas sin año. No se le pide a Gemini que compare fechas:
// eso lo hace el código (lib/school-dates.ts).
export function buildSchoolExtractionUserPrompt(childName: string, fileCount: number, weekStart?: string): string {
  const base = `Los siguientes ${fileCount} documento(s) son el menú escolar de ${childName}. Extrae su menú semanal siguiendo las instrucciones. El campo "child" de tu respuesta debe ser exactamente "${childName}".`
  if (!weekStart) return base
  const friday = new Date(`${weekStart}T12:00:00Z`)
  friday.setUTCDate(friday.getUTCDate() + 4)
  return `${base} Se está planificando la semana del lunes ${weekStart} al viernes ${friday.toISOString().slice(0, 10)}.`
}
