import { NextResponse, type NextRequest } from 'next/server'
import { FAMILY_COOKIE } from '@/server/auth/family'
import { SESSION_COOKIE } from '@/server/auth/session'

// GET /api/auth/revoked — a donde se manda a quien ya no tiene acceso (lo quitaron de la lista en /admin): borra las
// cookies de sesión y familia y lo lleva al login con el aviso. Solo borra cookies (idempotente), por eso es un GET:
// una página de servidor no puede borrarlas y el cliente llega aquí con una navegación.
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login?error=revoked', request.nextUrl.origin))
  response.cookies.delete(SESSION_COOKIE)
  response.cookies.delete(FAMILY_COOKIE)
  return response
}
