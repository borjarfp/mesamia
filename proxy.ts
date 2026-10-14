import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/server/auth/session'

// Puerta de entrada: sin sesión válida (cookie firmada y no caducada) no se entra a ninguna página
// ni a la API, salvo /login y /api/auth/*. Las páginas redirigen a /login; la API responde 401.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isAuthRoute = pathname === '/login' || pathname.startsWith('/api/auth/')

  let session = null
  try {
    session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  } catch {
    // AUTH_SECRET ausente o inválido: se trata como "sin sesión" (el login mostrará el error).
  }

  if (session) {
    // Con ?error= se muestra el aviso (p. ej. "ya no tienes acceso") aunque quede una cookie vieja.
    if (pathname === '/login' && !request.nextUrl.searchParams.has('error')) return NextResponse.redirect(new URL('/planificador', request.url))
    return NextResponse.next()
  }
  if (isAuthRoute) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Inicia sesión para continuar.' } }, { status: 401 })
  }
  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

// Todo salvo los estáticos de Next y los ficheros de public/ (cualquier ruta con extensión).
export const config = { matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'] }
