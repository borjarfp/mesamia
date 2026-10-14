import { NextResponse } from 'next/server'
import { requireMemberFamily } from '@/server/auth/family'
import { ValidationError } from '@/server/errors'
import { getFamilyStore } from '@/server/families/store'
import { toErrorResponse } from '@/server/http'
import { FamilyRulesSchema } from '@/server/rules/family-rules-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/families/[id]/rules → { rules }. Los valores por defecto si la familia no ha guardado ninguna.
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { family } = await requireMemberFamily(request, (await params).id)
    return NextResponse.json({ rules: await getFamilyStore().getRules(family.id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// PUT /api/families/[id]/rules   Body: FamilyRules completo → { rules }
// Sustituye las reglas del menú de la familia. Solo miembros (404 si no lo eres). Se validan con el mismo
// esquema que usa el servidor al leerlas, así que lo que se guarda es siempre válido.
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { family } = await requireMemberFamily(request, (await params).id)
    const body = await request.json().catch(() => { throw new ValidationError('El cuerpo de la petición debe ser JSON válido.') })
    const parsed = FamilyRulesSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Las reglas no tienen la forma esperada.', parsed.error.issues)
    await getFamilyStore().setRules(family.id, parsed.data)
    return NextResponse.json({ rules: parsed.data })
  } catch (error) {
    return toErrorResponse(error)
  }
}
