import { NextResponse } from 'next/server'
import { NotFoundError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'
import { historyStore } from '@/server/history/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/history/[id]
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const entry = await historyStore.get(id)
    if (!entry) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
    return NextResponse.json({ entry })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/history/[id]
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const removed = await historyStore.remove(id)
    if (!removed) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
