import { NextResponse } from 'next/server'
import { ValidationError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'
import { historyStore } from '@/server/history/store'
import { WeekPlanSchema } from '@/server/types'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/history
// Lista las semanas guardadas, más recientes primero.
export async function GET() {
  try {
    const entries = await historyStore.list()
    return NextResponse.json({ entries })
  } catch (error) {
    return toErrorResponse(error)
  }
}

const SaveBodySchema = z.object({
  label: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  week: WeekPlanSchema,
})

// POST /api/history
// Confirma/guarda una semana ya generada (equivalente a "Confirmar planificación" en el
// frontend). Body JSON: { label: string, weekStart?: 'YYYY-MM-DD', week: WeekPlan }.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new ValidationError('El cuerpo de la petición debe ser JSON válido.')
    })
    const parsed = SaveBodySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError('El cuerpo no tiene la forma esperada.', parsed.error.issues)
    }

    const entry = await historyStore.save(parsed.data.label, parsed.data.week, parsed.data.weekStart)
    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
