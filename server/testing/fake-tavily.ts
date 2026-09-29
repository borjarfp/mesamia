import type { RecipeSearchHit } from '../clients/tavily'

// Tavily de mentira para el modo pruebas (server/test-mode.ts): mismas funciones y forma de datos
// que server/clients/tavily.ts, sin gastar créditos. Las URLs no son recetas inventadas: son la
// página de BÚSQUEDA de ese plato en el sitio (existen y, al pinchar el badge, llevan a algo útil).
// El contenido es relleno con longitud suficiente para pasar el filtro de MIN_CANDIDATE_CHARS; el
// Gemini de mentira (fake-gemini.ts) no lo lee.
const FILLER = 'Contenido de prueba del modo pruebas: aquí iría el texto de la página de la receta (ingredientes, tiempo, dificultad y pasos). '.repeat(10)

export function fakeRecipeCandidates(dishTitle: string): RecipeSearchHit[] {
  return [{ url: `https://cookpad.com/es/buscar/${encodeURIComponent(dishTitle)}`, sourceName: 'Cookpad', content: `${dishTitle}. ${FILLER}` }]
}

export function fakeCookidooRecipeUrl(dishTitle: string): string {
  return `https://cookidoo.es/search/es-ES?query=${encodeURIComponent(dishTitle)}`
}

export function fakeExtractPages(urls: string[]): Map<string, string> {
  return new Map(urls.map(url => [url, FILLER]))
}
