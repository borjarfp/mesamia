import { NextResponse } from 'next/server'
import { z } from 'zod'
import { FAMILY_COOKIE, requireMemberFamily } from '@/server/auth/family'
import { NotFoundError, ValidationError } from '@/server/errors'
import { getFamilyStore } from '@/server/families/store'
import { ChildrenSchema, FamilyNameSchema, MAX_MEMBERS, MemberEmailSchema } from '@/server/families/schemas'
import { toErrorResponse } from '@/server/http'
import { sessionCookieOptions } from '@/server/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// Solo se puede tocar una familia de la que se es miembro; si no, 404 (no se revela que existe).
async function ownFamily(request: Request, { params }: RouteContext) {
  return requireMemberFamily(request, (await params).id)
}

// Todo es opcional (se actualiza lo que venga), pero al menos una cosa.
const UpdateBodySchema = z.object({ name: FamilyNameSchema.optional(), members: z.array(MemberEmailSchema).min(1, 'La familia necesita al menos una persona.').max(MAX_MEMBERS, `Una familia admite como máximo ${MAX_MEMBERS} personas.`).optional(), children: ChildrenSchema.optional() }).refine(body => body.name !== undefined || body.members !== undefined || body.children !== undefined, 'No hay nada que cambiar.')

// PATCH /api/families/[id]   Body: { name?, members?: string[] (correos), children?: string[] (nombres) }
// Lo editable de una familia: su nombre, quién tiene acceso y sus hijos e hijas. Cada lista es la lista completa
// resultante. Quien edita no puede quitarse a sí mismo (se quedaría sin acceso a lo que está editando).
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { session, family } = await ownFamily(request, context)
    const body = await request.json().catch(() => { throw new ValidationError('El cuerpo de la petición debe ser JSON válido.') })
    const parsed = UpdateBodySchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'El cuerpo no tiene la forma esperada.', parsed.error.issues)
    const members = parsed.data.members && [...new Set(parsed.data.members)]
    if (members && !members.includes(session.email)) throw new ValidationError('No puedes quitarte a ti mismo de la familia.')
    const updated = await getFamilyStore().update(family.id, { name: parsed.data.name, members, children: parsed.data.children })
    if (!updated) throw new NotFoundError('No existe esa familia.')
    return NextResponse.json({ family: updated })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/families/[id]
// Borra la familia para TODAS sus personas, con sus semanas guardadas. Hay que conservar al menos
// una familia propia. Si era la activa, se limpia la selección.
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { family, families } = await ownFamily(request, context)
    if (families.length < 2) throw new ValidationError('Tienes que conservar al menos una familia.')
    if (!(await getFamilyStore().remove(family.id))) throw new NotFoundError('No existe esa familia.')
    const response = new NextResponse(null, { status: 204 })
    response.cookies.set(FAMILY_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
    return response
  } catch (error) {
    return toErrorResponse(error)
  }
}
