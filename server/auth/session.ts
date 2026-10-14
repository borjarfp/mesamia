import { SignJWT, jwtVerify } from 'jose'
import { getAuthSecret } from '../env'

// Sesión sin estado: un JWT firmado (HS256) en una cookie httpOnly. Sin base de datos de sesiones,
// porque de momento los datos no son por usuario; solo hace falta saber QUIÉN ha entrado.
export const SESSION_COOKIE = 'mesamia_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type Session = { email: string; name?: string; picture?: string }

const key = () => new TextEncoder().encode(getAuthSecret())

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key())
}

// Devuelve la sesión si el token es válido y no ha caducado; null en cualquier otro caso.
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    if (typeof payload.email !== 'string') return null
    return { email: payload.email, name: payload.name as string | undefined, picture: payload.picture as string | undefined }
  } catch {
    return null
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}
