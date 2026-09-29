import { NextResponse } from 'next/server'
import { withTestMode } from '@/server/test-mode'
import { getTasteContext } from '@/server/history/taste-context'
import { parseSchoolMenuUploads, parseWeekStartField, toErrorResponse } from '@/server/http'
import { planFullWeek } from '@/server/pipeline/orchestrator'

export const runtime = 'nodejs'


// POST /api/menus/plan
// Pipeline completo, Pasos 1 a 4 en una sola llamada: sube los PDF/imágenes del menú escolar y
// devuelve la semana ya generada. Es el equivalente directo del botón único "Generar menú semanal
// inteligente" del frontend — si se prefiere más control (revisar la extracción antes de
// planificar, o volver a planificar sin repetir el OCR), usar /api/menus/extract +
// /api/menus/generate por separado.
//
// Body: multipart/form-data. Un campo por niña con su nombre como clave (p. ej. "Aina", "Iria") y
// sus archivos adjuntos, más un campo de texto opcional "weekStart" (YYYY-MM-DD, lunes de la semana
// a planificar). El historial de gustos (las 3 semanas guardadas anteriores a esa, ver
// server/history/taste-context.ts) lo añade el servidor solo; sin weekStart, las 3 más recientes.
export async function POST(request: Request) {
  return withTestMode(request, async () => {
    try {
      const formData = await request.formData()
      const uploads = await parseSchoolMenuUploads(formData)
      const weekStart = parseWeekStartField(formData)

      const taste = await getTasteContext(weekStart)
      const { schoolMenu, week, violations } = await planFullWeek(uploads, taste.text, weekStart)
      return NextResponse.json({ schoolMenu, week, violations })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
