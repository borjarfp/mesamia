import { NextResponse } from 'next/server'
import { parseOptionalJsonField, parseSchoolMenuUploads, toErrorResponse } from '@/server/http'
import { planFullWeek } from '@/server/pipeline/orchestrator'
import { HistorySummarySchema } from '@/server/types'
import { z } from 'zod'

export const runtime = 'nodejs'

const HistoryFieldSchema = z.array(HistorySummarySchema)

// POST /api/menus/plan
// Pipeline completo, Pasos 1 a 4 en una sola llamada: sube los PDF/imágenes del menú escolar y
// devuelve la semana ya generada. Es el equivalente directo del botón único "Generar menú semanal
// inteligente" del frontend — si se prefiere más control (revisar la extracción antes de
// planificar, o volver a planificar sin repetir el OCR), usar /api/menus/extract +
// /api/menus/generate por separado.
//
// Body: multipart/form-data. Un campo por niña con su nombre como clave (p. ej. "Aina", "Iria") y
// sus archivos adjuntos, más un campo de texto opcional "history" con el JSON de HistorySummary[].
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const uploads = await parseSchoolMenuUploads(formData)
    const history = parseOptionalJsonField(formData.get('history'), value => HistoryFieldSchema.parse(value))

    const { schoolMenu, week, violations } = await planFullWeek(uploads, history)
    return NextResponse.json({ schoolMenu, week, violations })
  } catch (error) {
    return toErrorResponse(error)
  }
}
