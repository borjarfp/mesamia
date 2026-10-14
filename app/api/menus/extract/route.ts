import { parseSchoolMenuUploads, parseWeekStartField, toErrorResponse } from '@/server/http'
import { withTestMode } from '@/server/test-mode'
import { extractSchoolMenu } from '@/server/pipeline/step1-extract-school-menu'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// POST /api/menus/extract
// Paso 1 en solitario: sube los PDF/imágenes del menú escolar y devuelve el JSON estructurado, sin
// generar todavía el resto de la semana. Útil para que el cliente pueda revisar/corregir la
// extracción antes de planificar, y para no repetir el OCR si ya se tiene ese JSON (lo puede
// reenviar directamente a /api/menus/generate).
//
// Body: multipart/form-data. Un campo de formulario por hijo o hija, con su propio nombre como clave (p.
// ej. "Lucía"), y uno o varios archivos (PDF, PNG, JPEG o WebP) adjuntos bajo ese campo.
// Campo de texto opcional "weekStart" (YYYY-MM-DD): la semana a planificar, para elegir la semana
// correcta de un menú mensual. La respuesta incluye menuStartDate/menuEndDate por hijo o hija si el
// documento trae fechas.
export async function POST(request: Request) {
  return withTestMode(request, async () => {
    try {
      const formData = await request.formData()
      const uploads = await parseSchoolMenuUploads(formData)
      const schoolMenu = await extractSchoolMenu(uploads, parseWeekStartField(formData))
      return NextResponse.json({ schoolMenu })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
