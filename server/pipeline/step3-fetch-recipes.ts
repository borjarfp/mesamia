import { searchRecipeCandidates, type RecipeSearchHit } from '../clients/tavily'
import type { DayName, MealSlot, PlannedDish } from '../types'

export type RecipeLookup = {
  key: string
  dish: PlannedDish
  candidates: RecipeSearchHit[]
}

// Clave para un hueco único dentro de una semana completa (los 14 huecos del Paso 2: cada
// combinación día+comida aparece una sola vez). NO sirve para varias alternativas del MISMO hueco
// (sustitución) — ahí, día+comida es igual para todas, así que hay que usar otra clave (ver
// server/pipeline/substitute.ts, que indexa por posición en vez de por día+comida).
export function slotKey(day: DayName, meal: MealSlot): string {
  return `${day}:${meal}`
}

// Paso 3: una búsqueda en Tavily por plato, todas en paralelo (Promise.all). Cada búsqueda devuelve
// hasta 3 recetas CANDIDATAS (de sitios distintos si es posible) — aquí no se elige ninguna: el
// Paso 4 las compara entre sí y con la receta propia de Gemini y se queda con la mejor. Si Tavily
// falla para un plato, ese plato se queda sin candidatas web en vez de tirar todo el pipeline.
//
// La clave de cada plato la decide el llamador (`key`), no se deriva aquí de day/meal: así esta
// función sirve igual para los 14 huecos únicos de una semana (clave = slotKey(day, meal)) que para
// varias alternativas de UN mismo hueco (clave = índice), sin colisiones de claves.
export async function fetchRecipes(items: Array<{ key: string; dish: PlannedDish }>): Promise<RecipeLookup[]> {
  return Promise.all(
    items.map(async ({ key, dish }) => {
      let candidates: RecipeSearchHit[] = []
      try {
        candidates = await searchRecipeCandidates(dish.title)
      } catch {
        candidates = []
      }
      return { key, dish, candidates }
    }),
  )
}
