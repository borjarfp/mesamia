import { NextResponse } from 'next/server'
import { ConfigError, NotFoundError, UpstreamApiError, ValidationError } from './errors'
import type { SchoolMenuUpload } from './pipeline/step1-extract-school-menu'

// Forma de error consistente en toda la API: { error: { code, message } }. Los códigos son estables
// y pensados para que un cliente pueda reaccionar por tipo sin parsear el mensaje humano.
export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status })
}

// Traduce cualquier error lanzado en el pipeline/rutas a una respuesta HTTP con el código correcto.
// Centralizado aquí para que cada route.ts solo tenga que hacer `catch (error) { return
// toErrorResponse(error) }` sin duplicar esta lógica en cada endpoint.
export function toErrorResponse(error: unknown) {
  if (error instanceof ValidationError) return errorResponse(400, 'validation_error', error.message, error.issues)
  if (error instanceof NotFoundError) return errorResponse(404, 'not_found', error.message)
  if (error instanceof ConfigError) return errorResponse(500, 'config_error', error.message)
  if (error instanceof UpstreamApiError) return errorResponse(502, `${error.provider}_error`, error.message)
  console.error('Error inesperado en la API:', error)
  return errorResponse(500, 'internal_error', 'Ha ocurrido un error inesperado.')
}

const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
// Gemini recomienda usar la Files API (no datos inline) por encima de este tamaño; para mantener
// el endpoint simple, en vez de eso rechazamos archivos más grandes con un error claro.
const MAX_FILE_BYTES = 15 * 1024 * 1024

// Contrato de subida: cada niña es un campo del formulario cuyo nombre es su propio nombre (p. ej.
// "Aina", "Iria"), con uno o varios archivos adjuntos bajo ese mismo campo. No hay una lista
// separada de "a quién pertenece cada archivo": el nombre del campo ya lo dice.
export async function parseSchoolMenuUploads(formData: FormData): Promise<SchoolMenuUpload[]> {
  const byChild = new Map<string, SchoolMenuUpload>()

  for (const [fieldName, value] of formData.entries()) {
    if (!(value instanceof File)) continue
    if (value.size === 0) continue

    if (!ACCEPTED_MIME_TYPES.has(value.type)) {
      throw new ValidationError(`El archivo "${value.name}" tiene un tipo no soportado (${value.type || 'desconocido'}). Solo se aceptan PDF, PNG, JPEG o WebP.`)
    }
    if (value.size > MAX_FILE_BYTES) {
      throw new ValidationError(`El archivo "${value.name}" pesa más de ${MAX_FILE_BYTES / (1024 * 1024)} MB.`)
    }

    const data = Buffer.from(await value.arrayBuffer())
    const existing = byChild.get(fieldName)
    if (existing) {
      existing.files.push({ data, mimeType: value.type })
    } else {
      byChild.set(fieldName, { child: fieldName, files: [{ data, mimeType: value.type }] })
    }
  }

  const uploads = Array.from(byChild.values())
  if (uploads.length === 0) {
    throw new ValidationError(
      'No se ha recibido ningún archivo. Sube el/los PDF o imágenes del menú escolar bajo un campo de formulario por niña (p. ej. "Aina", "Iria").',
    )
  }
  return uploads
}

// El historial de contexto viaja como un campo de texto JSON dentro del mismo formData (junto a
// los archivos), o como parte del body JSON en los endpoints que no suben archivos.
export function parseOptionalJsonField<T>(raw: FormDataEntryValue | null, parse: (value: unknown) => T): T | undefined {
  if (raw == null) return undefined
  if (typeof raw !== 'string') throw new ValidationError('Se esperaba un campo de texto JSON.')
  if (raw.trim() === '') return undefined
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new ValidationError('El campo no contiene JSON válido.')
  }
  return parse(parsedJson)
}
