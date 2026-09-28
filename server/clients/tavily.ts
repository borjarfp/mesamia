import { tavily, type TavilyClient } from '@tavily/core'
import { getTavilyApiKey } from '../env'
import { UpstreamApiError } from '../errors'

export type RecipeSourceName = 'Cookidoo' | 'El Comidista' | 'Directo al Paladar' | 'Cookpad' | 'Petitchef'

// El enunciado pide restringir "estrictamente" a estos 5 sitios. `includeDomains` de Tavily solo
// filtra por dominio, y El Comidista no es un dominio propio: vive bajo una ruta de elpais.com. Por
// eso, además de mandar los dominios permitidos a Tavily, cada resultado se vuelve a comprobar aquí
// (dominio + ruta cuando aplica) antes de aceptarlo — no nos fiamos solo del filtro del proveedor.
//
// `recipePath`: además, la URL tiene que ser una página de UNA receta, no un listado. Tavily devuelve
// a menudo páginas de búsqueda (cookpad.com/es/buscar/...) o de categoría, y antes se aceptaban como
// "receta" — el badge del plato acababa enlazando a una lista de resultados (visto probando con la
// API real). El Comidista no tiene un patrón de URL propio para recetas (son artículos), así que
// ahí solo se exige la ruta de la sección.
const ALLOWED_SOURCES: Array<{ domain: string; pathPrefix?: string; recipePath?: RegExp; label: RecipeSourceName }> = [
  { domain: 'cookidoo.es', recipePath: /^\/recipes\/recipe\//, label: 'Cookidoo' },
  { domain: 'elpais.com', pathPrefix: '/gastronomia/el-comidista', label: 'El Comidista' },
  { domain: 'directoalpaladar.com', recipePath: /receta/, label: 'Directo al Paladar' },
  { domain: 'cookpad.com', recipePath: /^\/[a-z]{2}\/recetas\/\d+/, label: 'Cookpad' },
  { domain: 'petitchef.es', recipePath: /^\/recetas\//, label: 'Petitchef' },
]

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
