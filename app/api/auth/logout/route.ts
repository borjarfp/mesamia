import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/server/auth/session'

export async function POST(request: NextRequest) {
  // 303: tras el POST del formulario, el navegador sigue con un GET a /login.
  const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin), 303)
  response.cookies.delete(SESSION_COOKIE)
  return response
}
