import { NextResponse, type NextRequest } from 'next/server'
import { FAMILY_COOKIE, SELECT_FAMILY_PATH, resolveFamilies } from '@/server/auth/family'
import { OAUTH_COOKIES, exchangeCodeForProfile, safeNextPath } from '@/server/auth/google'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, sessionCookieOptions } from '@/server/auth/session'
import { isEmailAllowed } from '@/server/auth/access'

// Paso 2 del login: Google vuelve aquí con ?code&state. Se comprueba el state, se valida el
// id_token y, si el correo está en la lista de acceso (o es el administrador), se crea la cookie de sesión.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const fail = (error: string, clearSession = false) => {
    const response = NextResponse.redirect(new URL(`/login?error=${error}`, origin))
    for (const name of Object.values(OAUTH_COOKIES)) response.cookies.delete(name)
    // Un correo sin acceso no puede conservar una sesión anterior (p. ej. de otra cuenta en el mismo navegador).
    if (clearSession) { response.cookies.delete(SESSION_COOKIE); response.cookies.delete(FAMILY_COOKIE) }
    return response
  }

  if (searchParams.get('error')) return fail('cancelled')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = request.cookies.get(OAUTH_COOKIES.state)?.value
  const verifier = request.cookies.get(OAUTH_COOKIES.verifier)?.value
  if (!code || !state || !expectedState || state !== expectedState || !verifier) return fail('state')

  let profile
  try {
    profile = await exchangeCodeForProfile(code, `${origin}/api/auth/google/callback`, verifier)
  } catch (error) {
    console.error('Error en el login con Google:', error)
    return fail('google')
  }

  // Solo entran los correos de la lista del administrador (/admin) y el propio administrador. Si no se puede
  // leer la lista (BD caída), se deniega: ante la duda, nadie entra.
  let allowed = false
  try {
    allowed = await isEmailAllowed(profile.email)
  } catch (error) {
    console.error('No se pudo comprobar la lista de acceso al iniciar sesión:', error)
    return fail('access_check', true)
  }
  if (!allowed) return fail('forbidden', true)

  const token = await createSessionToken(profile)
  // Con varias familias y ninguna elegida, lo primero es elegir (una sola vez, aquí: comprobarlo en
  // cada navegación hacía lenta la app). Si la BD falla no se bloquea el login: cada endpoint vuelve a comprobarlo.
  let destination = safeNextPath(request.cookies.get(OAUTH_COOKIES.next)?.value)
  try {
    const { active } = await resolveFamilies(profile, request.cookies.get(FAMILY_COOKIE)?.value)
    if (!active) destination = SELECT_FAMILY_PATH
  } catch (error) {
    console.error('No se pudieron resolver las familias al iniciar sesión:', error)
  }
  const response = NextResponse.redirect(new URL(destination, origin))
  response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_MAX_AGE_SECONDS })
  for (const name of Object.values(OAUTH_COOKIES)) response.cookies.delete(name)
  return response
}
