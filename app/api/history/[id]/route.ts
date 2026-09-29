import { NextResponse } from 'next/server'
import { withTestMode } from '@/server/test-mode'
import { NotFoundError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'
import { getHistoryStore } from '@/server/history/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/history/[id]
export async function GET(request: Request, { params }: RouteContext) {
  return withTestMode(request, async () => {
    try {
      const { id } = await params
      const entry = await getHistoryStore().get(id)
      if (!entry) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
      return NextResponse.json({ entry })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}

// DELETE /api/history/[id]
export async function DELETE(request: Request, { params }: RouteContext) {
  return withTestMode(request, async () => {
    try {
      const { id } = await params
      const removed = await getHistoryStore().remove(id)
      if (!removed) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
      return new NextResponse(null, { status: 204 })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
