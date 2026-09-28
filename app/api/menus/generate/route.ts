import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/server/http'
import { ValidationError } from '@/server/errors'
import { generateFromSchoolMenu } from '@/server/pipeline/orchestrator'
import { HistorySummarySchema, SchoolMenuExtractionSchema } from '@/server/types'
import { z } from 'zod'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  schoolMenu: SchoolMenuExtractionSchema,
  history: z.array(HistorySummarySchema).optional(),
})

// POST /api/menus/generate
// Pasos 2-4 del pipeline: planificar los huecos + buscar receta real (Tavily) + estandarizar
// (Gemini) + ensamblar. No hace OCR — recibe el JSON del menú escolar ya extraído (de
// /api/menus/extract, o guardado de una llamada anterior).
//
// Body JSON: { schoolMenu: SchoolMenuExtraction, history?: HistorySummary[] }
// Respuesta: { week: WeekPlan, violations: RuleViolation[] } — `violations` viene vacío si la
// propuesta cumple todas las reglas; si no está vacío, es la mejor propuesta tras los reintentos
// del Paso 2, con el detalle de qué no ha podido corregirse.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new ValidationError('El cuerpo de la petición debe ser JSON válido.')
    })
    const parsed = RequestBodySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError('El cuerpo no tiene la forma esperada.', parsed.error.issues)
    }

    const { week, violations } = await generateFromSchoolMenu(parsed.data.schoolMenu, parsed.data.history)
    return NextResponse.json({ week, violations })
  } catch (error) {
    return toErrorResponse(error)
  }
}
