import { DAY_NAMES, type FinalDayPlan, type FinalDish, type PlannedDish, type WeekPlan } from '../types'
import type { SelectedRecipe } from './step4-consolidate'
import { slotKey } from './step3-fetch-recipes'

// De un hueco planificado (paso 2) + la receta elegida para él (paso 4: una web real o la propia de
// Gemini), construye el nodo final que consume el frontend. Sin receta elegida (fallo o no cumplía
// las restricciones), el plato se queda tal cual lo planificó el paso 2, como "Generado por IA" —
// nunca se inventa una fuente web que no haya devuelto de verdad Tavily.
// Exportado porque server/pipeline/substitute.ts también lo necesita para construir las
// alternativas finales a partir de lo que proponga Gemini + lo que encuentre Tavily.
//
// `key` lo decide el llamador (no se deriva aquí de day/meal): al ensamblar una semana completa
// cada (day, meal) es único, pero al construir varias ALTERNATIVAS para un mismo hueco
// (sustitución) day/meal es el mismo para las N alternativas — usar slotKey(day, meal) ahí
// colisionaría y las N alternativas leerían siempre la misma entrada del mapa (bug real, cazado
// probando con la API real: las 3 alternativas salían con el mismo título/receta).
export function dishFromPlannedSlot(dish: PlannedDish, key: string, selected: Map<string, SelectedRecipe>): FinalDish {
  const recipe = selected.get(key)
  if (recipe) {
    const { source, ...content } = recipe
    return {
      ...content,
      proteinCategory: dish.proteinCategory,
      ...(source.kind === 'web' ? { sourceKind: 'web' as const, sourceName: source.name, sourceUrl: source.url } : { sourceKind: 'ia' as const, sourceName: 'Generado por IA' }),
    }
  }
  return {
    title: dish.title,
    description: dish.rationale ?? 'Propuesta generada por IA para esta semana.',
    ingredients: dish.mainIngredients,
    proteinCategory: dish.proteinCategory,
    sourceKind: 'ia',
    sourceName: 'Generado por IA',
    totalTimeMinutes: dish.totalTimeMinutes,
    difficulty: dish.difficulty,
  }
}

// Ensambla el JSON final de la semana a partir de los 14 huecos planificados (comida + cena de
// los 7 días — la comida de lunes a viernes es una comida real para los padres, no el menú
// escolar: eso solo se usa como contexto en el Paso 2 para que la cena no lo repita, nunca ocupa
// un hueco ni se muestra aquí, a petición explícita).
export function assembleWeek(plannedSlots: PlannedDish[], selected: Map<string, SelectedRecipe>): WeekPlan {
  const days: FinalDayPlan[] = DAY_NAMES.map(day => {
    const lunchSlot = plannedSlots.find(slot => slot.day === day && slot.meal === 'comida')
    const dinnerSlot = plannedSlots.find(slot => slot.day === day && slot.meal === 'cena')

    return {
      day,
      // lunchSlot/dinnerSlot siempre deberían existir (PLANNED_SLOTS cubre los 14), pero por si
      // Gemini se saltara alguno pese a normalizeSlots (server/pipeline/step2-plan-week.ts), un
      // plato neutro es más seguro que lanzar y tirar todo el pipeline abajo.
      comida: lunchSlot
        ? dishFromPlannedSlot(lunchSlot, slotKey(lunchSlot.day, lunchSlot.meal), selected)
        : fallbackDish(),
      cena: dinnerSlot
        ? dishFromPlannedSlot(dinnerSlot, slotKey(dinnerSlot.day, dinnerSlot.meal), selected)
        : fallbackDish(),
    }
  })

  return { days, generatedAt: new Date().toISOString() }
}

function fallbackDish(): FinalDish {
  return {
    title: 'Plato sencillo de la semana',
    description: 'No se pudo planificar este hueco; propuesta de relleno.',
    ingredients: ['verduras de temporada'],
    proteinCategory: 'otro',
    sourceKind: 'ia',
    sourceName: 'Generado por IA',
  }
}
