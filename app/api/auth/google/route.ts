import { NextResponse, type NextRequest } from 'next/server'
import { OAUTH_COOKIES, OAUTH_COOKIE_MAX_AGE_SECONDS, buildAuthorizationUrl, randomToken, safeNextPath } from '@/server/auth/google'
import { sessionCookieOptions } from '@/server/auth/session'

// Paso 1 del login: guarda state + PKCE verifier en cookies efímeras y manda al usuario a Google.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const state = randomToken()
  const verifier = randomToken()
  let url: string
  try {
    url = buildAuthorizationUrl(`${origin}/api/auth/google/callback`, state, verifier)
  } catch {
    return NextResponse.redirect(new URL('/login?error=config', origin))
  }
  const response = NextResponse.redirect(url)
  const options = { ...sessionCookieOptions, maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS }
  response.cookies.set(OAUTH_COOKIES.state, state, options)
  response.cookies.set(OAUTH_COOKIES.verifier, verifier, options)
  response.cookies.set(OAUTH_COOKIES.next, safeNextPath(request.nextUrl.searchParams.get('next') ?? undefined), options)
  return response
}
