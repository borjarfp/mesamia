import { NextResponse } from 'next/server'
import { z } from 'zod'
import { FAMILY_COOKIE, requireSession, resolveFamilies } from '@/server/auth/family'
import { ValidationError } from '@/server/errors'
import { getFamilyStore } from '@/server/families/store'
import { FamilyNameSchema } from '@/server/families/schemas'
import { toErrorResponse } from '@/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/families
// Las familias de la persona de la sesión (si no tiene ninguna, se le crea una) y el id de la
// activa, o null si tiene varias y aún no ha elegido. Respuesta: { families, activeId }.
export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    const selected = request.headers.get('cookie')?.split(';').map(part => part.trim().split('=')).find(([key]) => key === FAMILY_COOKIE)?.[1]
    const { families, active } = await resolveFamilies(session, selected)
    return NextResponse.json({ families, activeId: active?.id ?? null })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/families   Body: { name }
// Crea una familia con la persona de la sesión como único miembro. No la activa.
export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = await request.json().catch(() => { throw new ValidationError('El cuerpo de la petición debe ser JSON válido.') })
    const parsed = z.object({ name: FamilyNameSchema }).safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'El cuerpo no tiene la forma esperada.', parsed.error.issues)
    const family = await getFamilyStore().create(parsed.data.name, session.email)
    return NextResponse.json({ family }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
