import { classifyCustomWords, FISH_CATALOG, isDefaultFishSelection, MEAT_CATALOG, type AliasGroup, type FamilyRules } from '../rules/family-rules'

// Las reglas de UNA familia convertidas en líneas de prompt para Gemini. Salen del mismo objeto
// (FamilyRules) que usa el motor de reglas (server/rules/), así que lo que se le pide al LLM y lo que
// se comprueba después con código no pueden diferir. Las comparten la planificación, la sustitución y
// la elección de receta.

const category = (name: string, max: number | null): string[] => max === null ? [] : [max === 0 ? `- Ninguna ración de "${name}" en toda la semana.` : `- Máximo ${max} ${max === 1 ? 'ración' : 'raciones'} de "${name}" en toda la semana.`]

export function buildWeeklyLimitLines(rules: FamilyRules): string[] {
  const { maxHuevo, maxAve, maxPescado, maxCarneRoja, minLegumbre } = rules.weekly
  return [
    ...category('huevo', maxHuevo),
    ...category('ave', maxAve),
    ...category('pescado', maxPescado),
    ...category('carne_roja', maxCarneRoja),
    ...(minLegumbre !== null && minLegumbre > 0 ? [`- Mínimo ${minLegumbre} raciones de "legumbre" en toda la semana.`] : []),
  ]
}

// Versión en una línea, para la sustitución (que ya recibe el resto de la semana). [] si no hay ningún límite.
export function buildWeeklyLimitSummary(rules: FamilyRules): string[] {
  const { maxHuevo, maxAve, maxPescado, maxCarneRoja, minLegumbre } = rules.weekly
  const maxes = [['huevo', maxHuevo], ['ave', maxAve], ['pescado', maxPescado], ['carne_roja', maxCarneRoja]].flatMap(([name, max]) => (max === null ? [] : [`${max} ${name}`]))
  const min = minLegumbre !== null && minLegumbre > 0 ? `mínimo ${minLegumbre} legumbre` : null
  if (maxes.length === 0 && !min) return []
  return [`- ${[maxes.length ? `Máximo ${maxes.join(', ')}` : null, min].filter(Boolean).join('; ')}, en total en la semana.`]
}

// Las líneas de siempre para los ingredientes conocidos (marisco, atún, aceitunas, champiñones y tofu).
const GROUP_LINE: Record<Exclude<AliasGroup, 'champi_tofu'>, string> = {
  marisco: '- Sin marisco: nada de gambas, langostinos, mejillones, almejas, cangrejo, etc. Pota, calamar, pulpo y sepia SÍ están permitidos (clasifícalos como "pescado").',
  atun: '- Sin atún (ni bonito), ni fresco ni en lata.',
  aceitunas: '- Sin aceitunas (el aceite de oliva sí está permitido).',
}

// Mismo orden que las comprobaciones de rules/restrictions.ts: conocidos, pescado, carne, otros, tiempos.
export function buildRestrictionLines(rules: FamilyRules): string[] {
  const { ingredients, weekday } = rules
  const lines: string[] = []
  const custom = classifyCustomWords(ingredients.custom)
  for (const { group, aliases } of custom.groups) {
    if (group !== 'champi_tofu') lines.push(GROUP_LINE[group])
    else lines.push(aliases.length === 2 ? '- Sin champiñones y sin tofu.' : `- Sin ${aliases[0].suggestion}.`)
  }
  if (ingredients.restrictFish) {
    const allowed = FISH_CATALOG.filter(fish => (ingredients.allowedFish as readonly string[]).includes(fish.key)).map(fish => fish.label)
    if (isDefaultFishSelection(ingredients.allowedFish)) lines.push('- El único pescado permitido es merluza o salmón (además de pota, calamar, pulpo o sepia). Ningún otro pescado, tampoco como ingrediente secundario (anchoas, bacalao...). En los platos de pescado, nombra la especie en el título o en mainIngredients.')
    else lines.push(allowed.length === 0
      ? '- Nada de pescado en ningún plato, ni como ingrediente secundario.'
      : `- Los únicos pescados permitidos son: ${allowed.join('; ')}. Ningún otro pescado, tampoco como ingrediente secundario. En los platos de pescado, nombra la especie en el título o en mainIngredients.`)
  }
  if (ingredients.restrictMeat) {
    const allowed = MEAT_CATALOG.filter(meat => (ingredients.allowedMeat as readonly string[]).includes(meat.key)).map(meat => meat.label)
    lines.push(allowed.length === 0
      ? '- Nada de carne ni embutidos en ningún plato, ni como ingrediente secundario.'
      : `- Las únicas carnes permitidas son: ${allowed.join('; ')}. Ninguna otra carne ni embutido, tampoco como ingrediente secundario (un caldo de pollo, un trozo de jamón en unas lentejas…). En los platos de ave o carne_roja, nombra el tipo de carne en el título o en mainIngredients.`)
  }
  if (custom.others.length > 0) lines.push(`- Esta familia no quiere en ningún plato (tampoco como ingrediente secundario): ${custom.others.join(', ')}.`)
  if (weekday.targetMinutes !== null && weekday.maxMinutes !== null) {
    // El texto de siempre (con las reglas por defecto sale idéntico a antes de que fueran por familia).
    lines.push(`- De lunes a viernes (comida y cena), ${weekday.onlyEasy ? 'recetas fáciles (difficulty "facil") y rápidas' : 'recetas rápidas'}: idealmente ${weekday.targetMinutes} min en total, nunca más de ${weekday.maxMinutes} min (totalTimeMinutes). El fin de semana no tiene límite de tiempo${weekday.onlyEasy ? ' ni de dificultad' : ''}.`)
  } else if (weekday.onlyEasy || weekday.targetMinutes !== null || weekday.maxMinutes !== null) {
    const parts = [
      ...(weekday.onlyEasy ? ['recetas fáciles (difficulty "facil")'] : []),
      ...(weekday.targetMinutes !== null ? [`idealmente ${weekday.targetMinutes} min en total`] : []),
      ...(weekday.maxMinutes !== null ? [`nunca más de ${weekday.maxMinutes} min en total (totalTimeMinutes)`] : []),
    ]
    lines.push(`- De lunes a viernes (comida y cena): ${parts.join(', ')}. El fin de semana no tiene límite.`)
  }
  return lines
}

// Notas libres de la familia. No se comprueban con código, así que se avisa de que no están por
// encima de las reglas. '' si no hay.
export function buildNotesLines(rules: FamilyRules): string[] {
  const notes = rules.notes.trim()
  return notes ? ['Notas de esta familia (orientativas; las reglas anteriores mandan siempre):', notes] : []
}
