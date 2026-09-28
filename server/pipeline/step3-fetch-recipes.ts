import { extractPages, searchCookidooRecipeUrl, searchRecipeCandidates, type RecipeSearchHit } from '../clients/tavily'
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

// Paso 3: por cada plato, en paralelo (Promise.all), dos búsquedas en Tavily:
//   - la general en los 5 sitios: hasta 3 candidatas, de sitios distintos si es posible;
//   - una aparte solo en Cookidoo (ver server/clients/tavily.ts: en la general casi nunca sale).
// Luego se descargan TODAS las páginas de Cookidoo de la semana en una sola llamada y cada una se
// añade como una candidata más (hasta 4 en total). Aquí no se elige ninguna: el Paso 4 las compara
// entre sí y con la receta propia de Gemini. Si algo falla para un plato (o la descarga de
// Cookidoo entera), ese plato se queda con las candidatas que sí tenga, sin tirar el pipeline.
//
// La clave de cada plato la decide el llamador (`key`), no se deriva aquí de day/meal: así esta
// función sirve igual para los 14 huecos únicos de una semana (clave = slotKey(day, meal)) que para
// varias alternativas de UN mismo hueco (clave = índice), sin colisiones de claves.
export async function fetchRecipes(items: Array<{ key: string; dish: PlannedDish }>): Promise<RecipeLookup[]> {
  const searched = await Promise.all(
    items.map(async ({ key, dish }) => {
      const [candidates, cookidooUrl] = await Promise.all([
        searchRecipeCandidates(dish.title).catch(() => [] as RecipeSearchHit[]),
        searchCookidooRecipeUrl(dish.title).catch(() => null),
      ])
      // Si la búsqueda general ya trajo una de Cookidoo con contenido, no hace falta otra.
      const needsCookidoo = cookidooUrl && !candidates.some(candidate => candidate.sourceName === 'Cookidoo')
      return { key, dish, candidates, cookidooUrl: needsCookidoo ? cookidooUrl : null }
    }),
  )

  const cookidooUrls = searched.flatMap(item => item.cookidooUrl ? [item.cookidooUrl] : [])
  const pages = cookidooUrls.length > 0 ? await extractPages(cookidooUrls).catch(() => new Map<string, string>()) : new Map<string, string>()

  return searched.map(({ key, dish, candidates, cookidooUrl }) => {
    const content = cookidooUrl ? pages.get(cookidooUrl) : undefined
    return { key, dish, candidates: content ? [...candidates, { url: cookidooUrl!, sourceName: 'Cookidoo' as const, content }] : candidates }
  })
}
