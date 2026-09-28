import { ApiError, GoogleGenAI, type Content, type Part } from '@google/genai'
import { z } from 'zod'
import { getGeminiApiKey } from '../env'
import { UpstreamApiError } from '../errors'

let cachedClient: GoogleGenAI | null = null

// Cliente perezoso: no se crea (ni exige la API key) hasta la primera llamada real, para que
// importar este módulo no reviente en build/test si GEMINI_API_KEY todavía no está puesta.
function getClient(): GoogleGenAI {
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: getGeminiApiKey() })
  return cachedClient
}

export function textPart(text: string): Part {
  return { text }
}

export function inlineFilePart(base64Data: string, mimeType: string): Part {
  return { inlineData: { data: base64Data, mimeType } }
}

// z.toJSONSchema() genera JSON Schema (draft 2020-12); Gemini solo entiende un subconjunto
// (type/format/title/description/enum/items/prefixItems/minItems/maxItems/minimum/maximum/anyOf/
// oneOf/properties/additionalProperties/required/propertyOrdering) pasado en `responseJsonSchema`.
// $schema no es una de esas claves — se quita para no mandar ruido que Gemini simplemente ignora.
function toGeminiJsonSchema(schema: z.ZodType): unknown {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
  delete jsonSchema.$schema
  return jsonSchema
}

export type GenerateStructuredInput<Schema extends z.ZodType> = {
  model: string
  schema: Schema
  contents: Content[]
  systemInstruction?: string
  temperature?: number
}

const RETRYABLE_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// El nivel gratuito de la API de Gemini tiene límites de peticiones por minuto bastante bajos —
// comprobado de verdad: una petición aislada puede fallar con 429 (RESOURCE_EXHAUSTED) sin que
// haya nada mal en la llamada en sí, y la siguiente, segundos después, funciona. Reintentar con
// backoff solo para 429/5xx (errores transitorios del servicio) — un 400 (esquema mal formado) o
// un 401/403 (clave inválida) no se arregla reintentando, así que esos se propagan al momento.
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isRetryable = error instanceof ApiError && (error.status === 429 || error.status >= 500)
      if (!isRetryable || attempt === RETRYABLE_ATTEMPTS) throw error
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }
  throw lastError
}

// Llama a Gemini pidiendo explícitamente JSON (responseMimeType + responseJsonSchema derivado del
// propio esquema Zod) y devuelve el resultado ya parseado Y validado con ese mismo esquema — si
// Gemini se sale del contrato (JSON roto o que no cumple el shape), falla aquí con un error claro
// en vez de dejar que un `undefined.algo` reviente más adelante en el pipeline.
export async function generateStructured<Schema extends z.ZodType>({
  model,
  schema,
  contents,
  systemInstruction,
  temperature = 0.4,
}: GenerateStructuredInput<Schema>): Promise<z.infer<Schema>> {
  const ai = getClient()

  let response
  try {
    response = await callWithRetry(() =>
      ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature,
          responseMimeType: 'application/json',
          responseJsonSchema: toGeminiJsonSchema(schema),
        },
      }),
    )
  } catch (cause) {
    throw new UpstreamApiError('gemini', 'La llamada a la API de Gemini ha fallado', cause)
  }

  const text = response.text
  if (!text) {
    throw new UpstreamApiError('gemini', 'Gemini no devolvió contenido de texto en la respuesta', response)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new UpstreamApiError('gemini', 'Gemini devolvió un JSON con formato inválido', cause)
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new UpstreamApiError(
      'gemini',
      `La respuesta de Gemini no cumple el esquema esperado: ${result.error.message}`,
      result.error,
    )
  }
  return result.data
}
