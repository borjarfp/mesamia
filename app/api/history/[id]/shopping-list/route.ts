import { NextResponse } from 'next/server'
import { withTestMode } from '@/server/test-mode'
import { NotFoundError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'
import { getHistoryStore } from '@/server/history/store'
import { generateShoppingList } from '@/server/pipeline/shopping-list'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

// POST /api/history/[id]/shopping-list
// Devuelve la lista de la compra de una semana guardada: la ya guardada, o la genera con Gemini
// (comida y cena de los 7 días; 1 persona de lunes a jueves, 2 el viernes, 4 el fin de semana) y
// la guarda para no volver a gastar una llamada. Con ?regenerate=1 ignora la guardada, genera una
// nueva y la sustituye. Respuesta: { shoppingList }.
export async function POST(request: Request, { params }: RouteContext) {
  return withTestMode(request, async () => {
    try {
      const { id } = await params
      const store = getHistoryStore()
      const entry = await store.get(id)
      if (!entry) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
      const regenerate = new URL(request.url).searchParams.get('regenerate') === '1'
      if (entry.shoppingList && !regenerate) return NextResponse.json({ shoppingList: entry.shoppingList })
      const shoppingList = await generateShoppingList(entry.week)
      if (!(await store.setShoppingList(id, shoppingList))) throw new NotFoundError(`No existe ninguna semana guardada con id "${id}".`)
      return NextResponse.json({ shoppingList })
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
