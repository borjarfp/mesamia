import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAccessStore } from '@/server/access/store'
import { invalidateAccessCache, isAdminEmail } from '@/server/auth/access'
import { requireAdmin } from '@/server/auth/family'
import { getAdminEmail } from '@/server/env'
import { NotFoundError, ValidationError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EmailSchema = z.string().trim().toLowerCase().email('Escribe un correo válido.').max(254)
const MAX_ALLOWED = 500

// Lista de acceso a la app. SOLO el administrador (ADMIN_EMAIL): cualquier otra persona recibe 403.
// Entran únicamente los correos de esta lista (y el administrador, siempre).

// GET /api/admin/access → { admin, emails: [{ email, addedBy, createdAt }] }
export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return NextResponse.json({ admin: getAdminEmail(), emails: await getAccessStore().list() })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST /api/admin/access   Body: { email } → { added: boolean }  (200 si ya estaba)
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request)
    const body = await request.json().catch(() => { throw new ValidationError('El cuerpo de la petición debe ser JSON válido.') })
    const parsed = z.object({ email: EmailSchema }).safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Escribe un correo válido.')
    if (isAdminEmail(parsed.data.email)) throw new ValidationError('Ese es el correo del administrador: ya tiene acceso siempre.')
    const store = getAccessStore()
    if ((await store.list()).length >= MAX_ALLOWED) throw new ValidationError(`La lista admite como máximo ${MAX_ALLOWED} correos.`)
    const added = await store.add(parsed.data.email, admin.email)
    invalidateAccessCache()
    return NextResponse.json({ added }, { status: added ? 201 : 200 })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// DELETE /api/admin/access?email=…  → 204. Quitar a alguien le cierra la sesión que tenga abierta (se comprueba en cada petición).
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request)
    const parsed = EmailSchema.safeParse(new URL(request.url).searchParams.get('email') ?? '')
    if (!parsed.success) throw new ValidationError('Falta el correo.')
    if (isAdminEmail(parsed.data)) throw new ValidationError('No se puede quitar al administrador.')
    if (!(await getAccessStore().remove(parsed.data))) throw new NotFoundError('Ese correo no está en la lista.')
    invalidateAccessCache()
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
