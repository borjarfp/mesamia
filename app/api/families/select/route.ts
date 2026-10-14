import { NextResponse } from 'next/server'
import { z } from 'zod'
import { FAMILY_COOKIE, requireSession } from '@/server/auth/family'
import { NotFoundError, ValidationError } from '@/server/errors'
import { getFamilyStore } from '@/server/families/store'
import { toErrorResponse } from '@/server/http'
import { SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from '@/server/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/families/select   Body: { familyId }
// Elige la familia activa: a partir de aquí todas las acciones sobre semanas son de esa familia.
// Se comprueba que la persona sea miembro antes de guardar la elección en la cookie.
export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = await request.json().catch(() => { throw new ValidationError('El cuerpo de la petición debe ser JSON válido.') })
    const parsed = z.object({ familyId: z.string().min(1) }).safeParse(body)
    if (!parsed.success) throw new ValidationError('Falta "familyId".')
    const family = (await getFamilyStore().listForUser(session.email)).find(item => item.id === parsed.data.familyId)
    if (!family) throw new NotFoundError('No existe esa familia.')
    const response = NextResponse.json({ family })
    response.cookies.set(FAMILY_COOKIE, family.id, { ...sessionCookieOptions, maxAge: SESSION_MAX_AGE_SECONDS })
    return response
  } catch (error) {
    return toErrorResponse(error)
  }
}
