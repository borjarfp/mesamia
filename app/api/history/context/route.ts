import { NextResponse } from 'next/server'
import { ValidationError } from '@/server/errors'
import { getTasteContext, TASTE_CONTEXT_INSTRUCTIONS } from '@/server/history/taste-context'
import { toErrorResponse } from '@/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/history/context?weekStart=YYYY-MM-DD
// Lo que ve el LLM de las semanas anteriores al planificar la semana que empieza en `weekStart`:
// qué semanas usa (`weeks`), el texto tal cual va en el prompt (`text`) y cómo se le pide
// interpretarlo (`instructions`). Sirve para mostrarlo en el planificador y para depurar. Es un
// segmento estático, así que Next lo resuelve antes que /api/history/[id].
export async function GET(request: Request) {
  try {
    const weekStart = new URL(request.url).searchParams.get('weekStart') ?? undefined
    if (weekStart && !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new ValidationError('"weekStart" debe tener el formato YYYY-MM-DD.')
    const taste = await getTasteContext(weekStart)
    return NextResponse.json({ ...taste, instructions: TASTE_CONTEXT_INSTRUCTIONS })
  } catch (error) {
    return toErrorResponse(error)
  }
}
