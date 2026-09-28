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
    'Devuelve exclusivamente el JSON solicitado, sin texto adicional.',
  ].join('\n')
}

// El nombre de la niña no se puede fiar a que el propio documento lo mencione con claridad; el
// cliente indica a qué niña pertenece cada archivo subido, y aquí se lo recordamos a Gemini para
// que etiquete correctamente el resultado de ese documento en concreto.
export function buildSchoolExtractionUserPrompt(childName: string, fileCount: number): string {
  return `Los siguientes ${fileCount} documento(s) son el menú escolar de ${childName}. Extrae su menú semanal siguiendo las instrucciones. El campo "child" de tu respuesta debe ser exactamente "${childName}".`
}
