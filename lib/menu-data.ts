import { MAX_AVE, MAX_CARNE_ROJA, MAX_HUEVO, MAX_PESCADO, MAX_WEEKDAY_MINUTES, MIN_LEGUMBRE, TARGET_WEEKDAY_MINUTES } from '@/server/rules/constants'

// Todas las reglas que aplica el backend al generar/sustituir platos, agrupadas para mostrarlas en
// el planificador (RulesPanel). Los números salen de server/rules/constants.ts (constantes puras,
// sin zod ni código de servidor), así que no pueden desincronizarse; el texto sí hay que mantenerlo
// a mano si cambia una regla de server/rules/engine.ts o restrictions.ts.
export const ruleGroups: Array<{ title: string; rules: string[] }> = [
  {
    title: 'Equilibrio semanal',
    rules: [
      `Mínimo ${MIN_LEGUMBRE} raciones de legumbres.`,
      `Máximo ${MAX_HUEVO} raciones de huevo.`,
      `Máximo ${MAX_AVE} raciones de ave/pollo.`,
      `Máximo ${MAX_PESCADO} raciones de pescado (pota, calamar, pulpo y sepia cuentan como pescado).`,
      `Máximo ${MAX_CARNE_ROJA} ración de carne roja.`,
      'Se cuentan las 14 comidas de la semana: comida y cena de lunes a domingo.',
    ],
  },
  {
    title: 'Ingredientes',
    rules: [
      'Sin marisco: ni gambas, langostinos, mejillones, almejas, cangrejo…',
      'Sí se permiten pota, calamar, pulpo y sepia.',
      'Pescado: solo merluza o salmón. Ningún otro, tampoco como ingrediente secundario (anchoas, bacalao…).',
      'Sin atún ni bonito.',
      'Sin aceitunas (el aceite de oliva sí).',
    ],
  },
  {
    title: 'Lunes a viernes',
    rules: [
      `Recetas fáciles, de unos ${TARGET_WEEKDAY_MINUTES} min y nunca más de ${MAX_WEEKDAY_MINUTES} min en total.`,
      'La cena no repite el tipo de proteína ni los ingredientes de lo que Aina e Iria han comido ese día en el cole.',
      'El fin de semana no tiene límite de tiempo ni de dificultad.',
    ],
  },
]

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
