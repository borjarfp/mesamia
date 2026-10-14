import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_COOKIES, exchangeCodeForProfile, safeNextPath } from '@/server/auth/google'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, sessionCookieOptions } from '@/server/auth/session'
import { getAllowedEmails } from '@/server/env'

// Paso 2 del login: Google vuelve aquí con ?code&state. Se comprueba el state, se valida el
// id_token y, si el correo está permitido, se crea la cookie de sesión.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const fail = (error: string) => {
    const response = NextResponse.redirect(new URL(`/login?error=${error}`, origin))
    for (const name of Object.values(OAUTH_COOKIES)) response.cookies.delete(name)
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

  const allowed = getAllowedEmails()
  if (allowed.length > 0 && !allowed.includes(profile.email)) return fail('forbidden')

  const token = await createSessionToken(profile)
  const response = NextResponse.redirect(new URL(safeNextPath(request.cookies.get(OAUTH_COOKIES.next)?.value), origin))
  response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_MAX_AGE_SECONDS })
  for (const name of Object.values(OAUTH_COOKIES)) response.cookies.delete(name)
  return response
}
