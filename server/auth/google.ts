import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getGoogleClientId, getGoogleClientSecret } from '../env'

// Flujo "authorization code" + PKCE contra Google, sin librería de auth: pocas líneas y todo visible.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

export const OAUTH_COOKIES = { state: 'mesamia_oauth_state', verifier: 'mesamia_oauth_verifier', next: 'mesamia_oauth_next' }
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600

export const randomToken = () => randomBytes(32).toString('base64url')
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

export function buildAuthorizationUrl(redirectUri: string, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params}`
}

export type GoogleProfile = { email: string; name?: string; picture?: string }

// Cambia el code por un id_token, y lo valida (firma, emisor, audiencia y caducidad) antes de fiarse.
export async function exchangeCodeForProfile(code: string, redirectUri: string, verifier: string): Promise<GoogleProfile> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!response.ok) throw new Error(`Google rechazó el código (${response.status}).`)
  const { id_token } = (await response.json()) as { id_token?: string }
  if (!id_token) throw new Error('Google no devolvió id_token.')

  const { payload } = await jwtVerify(id_token, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: getGoogleClientId(),
  })
  if (typeof payload.email !== 'string' || payload.email_verified !== true) throw new Error('La cuenta de Google no tiene un correo verificado.')
  return { email: payload.email.toLowerCase(), name: payload.name as string | undefined, picture: payload.picture as string | undefined }
}

// Solo rutas internas ("/planificador"), nunca "//otro.sitio" ni URLs absolutas: evita open redirect.
export function safeNextPath(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/api/') ? value : '/planificador'
}
