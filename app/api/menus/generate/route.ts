import { NextResponse } from 'next/server'
import { withTestMode } from '@/server/test-mode'
import { toErrorResponse } from '@/server/http'
import { ValidationError } from '@/server/errors'
import { getTasteContext } from '@/server/history/taste-context'
import { generateFromSchoolMenu } from '@/server/pipeline/orchestrator'
import { SchoolMenuExtractionSchema } from '@/server/types'
import { z } from 'zod'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  schoolMenu: SchoolMenuExtractionSchema,
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// POST /api/menus/generate
// Pasos 2-4 del pipeline: planificar los huecos + buscar receta real (Tavily) + estandarizar
// (Gemini) + ensamblar. No hace OCR — recibe el JSON del menú escolar ya extraído (de
// /api/menus/extract, o guardado de una llamada anterior).
//
// Body JSON: { schoolMenu: SchoolMenuExtraction, weekStart?: 'YYYY-MM-DD' } — el historial de gustos
// (3 semanas guardadas anteriores a weekStart) lo añade el servidor, ver server/history/taste-context.ts.
// Respuesta: { week: WeekPlan, violations: RuleViolation[] } — `violations` viene vacío si la
// propuesta cumple todas las reglas; si no está vacío, es la mejor propuesta tras los reintentos
// del Paso 2, con el detalle de qué no ha podido corregirse.
export async function POST(request: Request) {
  return withTestMode(request, async () => {
    try {
      const body = await request.json().catch(() => {
        throw new ValidationError('El cuerpo de la petición debe ser JSON válido.')
      })
      const parsed = RequestBodySchema.safeParse(body)
      if (!parsed.success) {
        throw new ValidationError('El cuerpo no tiene la forma esperada.', parsed.error.issues)
      }

      const taste = await getTasteContext(parsed.data.weekStart)
      const { week, violations } = await generateFromSchoolMenu(parsed.data.schoolMenu, taste.text)
      return NextResponse.json({ week, violations })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
