import { tavily, type TavilyClient } from '@tavily/core'
import { getTavilyApiKey } from '../env'
import { UpstreamApiError } from '../errors'
import { isTestMode } from '../test-mode'
import { fakeCookidooRecipeUrl, fakeExtractPages, fakeRecipeCandidates } from '../testing/fake-tavily'

import { RECIPE_SOURCES, type RecipeSourceName } from './recipe-sources'

export type { RecipeSourceName }

// Sitios permitidos y por qué se filtra por dominio + ruta: ver ./recipe-sources.ts.
const ALLOWED_SOURCES = RECIPE_SOURCES

// Una página con menos texto que esto no trae una receta completa (muro de pago, bloqueo, página
// casi vacía: una de El Comidista llegó con 144 caracteres) — no merece la pena ofrecerla como
// candidata.
const MIN_CANDIDATE_CHARS = 800

export const ALLOWED_RECIPE_DOMAINS = ALLOWED_SOURCES.map(source => source.domain)

function matchAllowedSource(url: string): RecipeSourceName | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const hostname = parsed.hostname.replace(/^www\./, '')
  for (const source of ALLOWED_SOURCES) {
    if (hostname !== source.domain) continue
    if (source.pathPrefix && !parsed.pathname.startsWith(source.pathPrefix)) continue
    if (source.recipePath && !source.recipePath.test(parsed.pathname)) continue
    return source.label
  }
  return null
}

let cachedClient: TavilyClient | null = null
function getClient(): TavilyClient {
  if (!cachedClient) cachedClient = tavily({ apiKey: getTavilyApiKey() })
  return cachedClient
}

const RETRYABLE_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// @tavily/core usa axios por debajo; no expone su propia clase de error con status, así que se
// lee de la forma en la que axios adjunta la respuesta HTTP al error (`error.response.status`) —
// mismo criterio que en server/clients/gemini.ts: solo 429/5xx son transitorios y merecen
// reintento, cualquier otra cosa (401 de clave inválida, etc.) se propaga al momento.
function isRetryableStatus(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return typeof status === 'number' && (status === 429 || status >= 500)
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryableStatus(error) || attempt === RETRYABLE_ATTEMPTS) throw error
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
  throw lastError
}

export type RecipeSearchHit = {
  url: string
  sourceName: RecipeSourceName
  content: string
}

export const MAX_RECIPE_CANDIDATES = 3

// Busca recetas para `dishTitle` en los 5 sitios permitidos y devuelve hasta `max` candidatas ya
// validadas (dominio + ruta), en el orden de relevancia de Tavily pero priorizando que vengan de
// sitios DISTINTOS: así quien elige (Paso 4) puede comparar p. ej. la versión de Cookidoo con la de
// Directo al Paladar, en vez de tres variantes del mismo sitio. Lista vacía si no hay ninguna
// que pase el filtro estricto. Elegir cuál es mejor (o ninguna) NO se hace aquí: ver
// server/pipeline/step4-consolidate.ts.
export async function searchRecipeCandidates(dishTitle: string, max = MAX_RECIPE_CANDIDATES): Promise<RecipeSearchHit[]> {
  if (isTestMode()) return fakeRecipeCandidates(dishTitle).slice(0, max) // server/testing/fake-tavily.ts
  const client = getClient()
  let response
  try {
    response = await callWithRetry(() =>
      client.search(`receta ${dishTitle}`, {
        includeDomains: ALLOWED_RECIPE_DOMAINS,
        searchDepth: 'advanced',
        maxResults: 8,
        includeRawContent: 'text',
      }),
    )
  } catch (cause) {
    throw new UpstreamApiError('tavily', `La búsqueda en Tavily ha fallado para "${dishTitle}"`, cause)
  }

  const hits: RecipeSearchHit[] = []
  for (const result of response.results) {
    const sourceName = matchAllowedSource(result.url)
    if (!sourceName) continue // Tavily a veces cuela resultados fuera del dominio pedido; se descartan
    const content = result.rawContent ?? result.content
    if (!content || content.length < MIN_CANDIDATE_CHARS) continue
    hits.push({ url: result.url, sourceName, content })
  }
  const firstPerSource = hits.filter((hit, index) => hits.findIndex(other => other.sourceName === hit.sourceName) === index)
  const rest = hits.filter(hit => !firstPerSource.includes(hit))
  return [...firstPerSource, ...rest].slice(0, max)
}

// --- Cookidoo -------------------------------------------------------------------------------------
//
// En la búsqueda general (los 5 sitios a la vez) Cookidoo casi nunca entra entre los primeros
// resultados, y cuando entra suele venir sin contenido (comprobado con 5 platos típicos: 0 de 5).
// La familia tiene Thermomix y suscripción, así que se busca aparte (opción B acordada con el
// usuario, pensada para gastar pocos créditos de Tavily):
//   1. una búsqueda `basic` solo en cookidoo.es por plato (1 crédito, sin contenido: solo la URL);
//   2. UNA llamada a `extract` con todas esas URLs a la vez (1 crédito por cada 5 páginas).
// Unos +17 créditos por semana generada (sobre ~28). Ojo: las páginas públicas de Cookidoo traen
// ingredientes, tiempo y dificultad, pero NO los pasos (son solo para suscriptores).

// Primera URL de una receta de Cookidoo para el plato, o null. Sin contenido: se descarga luego en
// bloque con extractPages().
export async function searchCookidooRecipeUrl(dishTitle: string): Promise<string | null> {
  if (isTestMode()) return fakeCookidooRecipeUrl(dishTitle)
  const client = getClient()
  let response
  try {
    response = await callWithRetry(() => client.search(`receta ${dishTitle}`, { includeDomains: ['cookidoo.es'], searchDepth: 'basic', maxResults: 5 }))
  } catch (cause) {
    throw new UpstreamApiError('tavily', `La búsqueda en Cookidoo ha fallado para "${dishTitle}"`, cause)
  }
  return response.results.map(result => result.url).find(url => matchAllowedSource(url) === 'Cookidoo') ?? null
}

// Tavily admite hasta 20 URLs por llamada a extract.
const MAX_EXTRACT_URLS = 20

// Descarga el texto de varias páginas con el mínimo de llamadas (una por cada 20 URLs). Devuelve
// solo las que se pudieron leer y traen contenido suficiente; las que fallan simplemente no están.
export async function extractPages(urls: string[]): Promise<Map<string, string>> {
  if (isTestMode()) return fakeExtractPages(urls)
  const client = getClient()
  const unique = [...new Set(urls)]
  const pages = new Map<string, string>()
  for (let start = 0; start < unique.length; start += MAX_EXTRACT_URLS) {
    const batch = unique.slice(start, start + MAX_EXTRACT_URLS)
    let response
    try {
      response = await callWithRetry(() => client.extract(batch, { extractDepth: 'basic', format: 'text' }))
    } catch (cause) {
      throw new UpstreamApiError('tavily', 'No se han podido descargar las páginas de receta', cause)
    }
    for (const result of response.results) {
      if (result.rawContent && result.rawContent.length >= MIN_CANDIDATE_CHARS) pages.set(result.url, result.rawContent)
    }
  }
  return pages
}
