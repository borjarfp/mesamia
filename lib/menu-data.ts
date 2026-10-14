import { RECIPE_SOURCES } from '@/server/clients/recipe-sources'
import { FISH_CATALOG, MEAT_CATALOG, type FamilyRules } from '@/server/rules/family-rules'

// Las reglas de UNA familia agrupadas para mostrarlas (RulesPanel). Salen del mismo objeto
// (FamilyRules) que usa el motor de reglas y los prompts, así que lo que se ve es lo que se aplica. Las
// líneas del menú escolar son fijas: no forman parte de las reglas por familia.
export type RuleGroup = { title: string; rules: string[] }

export function ruleGroupsFor(rules: FamilyRules): RuleGroup[] {
  const { weekly, weekday, ingredients } = rules
  const times = (max: number | null, what: string) => (max === null ? [] : [`${max === 0 ? 'Ninguna ración' : `Máximo ${max} ${max === 1 ? 'ración' : 'raciones'}`} de ${what}.`])
  const weeklyRules = [
    ...(weekly.minLegumbre !== null && weekly.minLegumbre > 0 ? [`Mínimo ${weekly.minLegumbre} raciones de legumbres.`] : []),
    ...times(weekly.maxHuevo, 'huevo'),
    ...times(weekly.maxAve, 'ave/pollo'),
    ...times(weekly.maxPescado, 'pescado (pota, calamar, pulpo y sepia cuentan como pescado)'),
    ...times(weekly.maxCarneRoja, 'carne roja'),
  ]
  const weekdayTime = weekday.targetMinutes !== null && weekday.maxMinutes !== null
    ? [`Recetas ${weekday.onlyEasy ? 'fáciles, ' : ''}de unos ${weekday.targetMinutes} min y nunca más de ${weekday.maxMinutes} min en total.`]
    : [...(weekday.onlyEasy ? ['Solo recetas fáciles.'] : []), ...(weekday.targetMinutes !== null ? [`Recetas de unos ${weekday.targetMinutes} min.`] : []), ...(weekday.maxMinutes !== null ? [`Nunca más de ${weekday.maxMinutes} min en total.`] : [])]
  const allowedFish = FISH_CATALOG.filter(fish => (ingredients.allowedFish as readonly string[]).includes(fish.key)).map(fish => fish.label)
  const allowedMeat = MEAT_CATALOG.filter(meat => (ingredients.allowedMeat as readonly string[]).includes(meat.key)).map(meat => meat.label)
  const groups: RuleGroup[] = [
    {
      title: 'Equilibrio semanal',
      rules: weeklyRules.length === 0 ? ['Sin límites semanales.'] : [...weeklyRules, 'Se cuentan las 14 comidas de la semana: comida y cena de lunes a domingo.'],
    },
    {
      title: 'Ingredientes',
      rules: [
        ...(ingredients.restrictFish ? [allowedFish.length === 0 ? 'Sin pescado.' : `Pescado: solo ${allowedFish.join('; ')}. Ningún otro, tampoco como ingrediente secundario.`] : []),
        ...(ingredients.restrictMeat ? [allowedMeat.length === 0 ? 'Sin carne ni embutidos.' : `Carne: solo ${allowedMeat.join('; ')}. Ninguna otra, tampoco como ingrediente secundario.`] : []),
        ...(ingredients.custom.length > 0 ? [`Sin: ${ingredients.custom.join(', ')}.`] : []),
        ...(!ingredients.restrictFish && !ingredients.restrictMeat && ingredients.custom.length === 0 ? ['Sin restricciones de ingredientes.'] : []),
      ],
    },
    {
      title: 'Lunes a viernes',
      rules: [
        ...weekdayTime,
        'Si subes menús escolares: la comida de los adultos se parece a la que comen los niños ese día en el cole (mismo tipo de plato).',
        'Si subes menús escolares: la cena se inspira en la propuesta de cena del menú (si la trae), como sugerencia.',
        'Si subes menús escolares: la cena no repite el tipo de proteína ni los ingredientes de lo que los niños han comido ese día en el cole.',
        ...(weekdayTime.length > 0 ? [`El fin de semana no tiene límite de tiempo${weekday.onlyEasy ? ' ni de dificultad' : ''}.`] : ['Sin límite de tiempo ni de dificultad.']),
      ],
    },
  ]
  if (rules.notes.trim()) groups.push({ title: 'Notas de la familia', rules: [rules.notes.trim()] })
  return groups
}

// Los sitios en los que se buscan recetas con Tavily, para listarlos en RulesPanel. Salen del mismo
// módulo que usa el backend para filtrar (server/clients/recipe-sources.ts), así que no pueden
// desincronizarse.
export const recipeSources = RECIPE_SOURCES.map(({ label, homeUrl, note }) => ({ label, url: homeUrl, displayUrl: homeUrl.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, ''), note }))

// Mismo vocabulario que server/types.ts (FinalDish.sourceName): las fuentes reales que puede
// devolver el backend, más "Manual" para los platos que se escriben a mano en el Drawer de
// sustitución (eso sí es puramente del frontend, no lo genera ni valida el backend).
export const sourceStyles: Record<string, string> = {
  'Generado por IA': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Cookidoo: 'bg-orange-50 text-orange-700 border-orange-100',
  'El Comidista': 'bg-blue-50 text-blue-700 border-blue-100',
  Cookpad: 'bg-rose-50 text-rose-700 border-rose-100',
  'Directo al Paladar': 'bg-amber-50 text-amber-700 border-amber-100',
  Petitchef: 'bg-violet-50 text-violet-700 border-violet-100',
  Manual: 'bg-slate-100 text-slate-600 border-slate-200',
}

// Fuentes sin enlace externo real: la IA no enlaza a ningún sitio y "Manual" lo escribiste tú.
// El resto son webs externas de verdad.
export const hasExternalLink = (source: string) => !['Generado por IA', 'Manual'].includes(source)
