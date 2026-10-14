import { NextResponse } from 'next/server'
import { requireFamily } from '@/server/auth/family'
import { getFamilyStore } from '@/server/families/store'
import { toErrorResponse } from '@/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/rules → { familyId, familyName, rules }
// Las reglas del menú de la familia ACTIVA (409 family_required si hay que elegir). Es lo que pinta el
// RulesPanel del planificador y de las semanas guardadas.
export async function GET(request: Request) {
  try {
    const { family } = await requireFamily(request)
    return NextResponse.json({ familyId: family.id, familyName: family.name, rules: await getFamilyStore().getRules(family.id) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
