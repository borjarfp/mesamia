import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { FamilyRequiredError, UnauthorizedError } from '../errors'
import { getFamilyStore } from '../families/store'
import type { Family } from '../types'
import { SESSION_COOKIE, verifySessionToken, type Session } from './session'

// Familia activa: la que ha elegido la persona (cookie FAMILY_COOKIE, con el id) o, si solo tiene
// una, esa. La cookie NO es de confianza: en cada petición se comprueba contra la BD que el correo
// de la sesión sigue siendo miembro de esa familia; un id ajeno o de una familia a la que ya no se
// pertenece se ignora. Todas las acciones sobre semanas guardadas pasan por aquí.
export const FAMILY_COOKIE = 'mesamia_family'
export const DEFAULT_FAMILY_NAME = 'Mi familia'
export const SELECT_FAMILY_PATH = '/familias/seleccionar'

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}

// Las familias de la persona (creándole una si no tiene ninguna) y cuál es la activa, o null si
// tiene varias y todavía no ha elegido.
export async function resolveFamilies(session: Session, selectedId: string | undefined): Promise<{ families: Family[]; active: Family | null }> {
  const families = await getFamilyStore().ensureForUser(session.email, DEFAULT_FAMILY_NAME)
  const active = families.find(family => family.id === selectedId) ?? (families.length === 1 ? families[0] : null)
  return { families, active }
}

// --- Rutas de app/api/** (reciben un Request) ----------------------------------------------------

export async function requireSession(request: Request): Promise<Session> {
  const session = await verifySessionToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE))
  if (!session) throw new UnauthorizedError()
  return session
}

export async function requireFamily(request: Request): Promise<{ session: Session; family: Family }> {
  const session = await requireSession(request)
  const { active } = await resolveFamilies(session, readCookie(request.headers.get('cookie'), FAMILY_COOKIE))
  if (!active) throw new FamilyRequiredError()
  return { session, family: active }
}

// --- Páginas (Server Components) ---------------------------------------------------------------

export async function requireSessionForPage(): Promise<Session> {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  return session
}

// Para /planificador, /guardados y /semana/[slug]: sin familia activa, al selector.
export async function requireFamilyForPage(): Promise<{ session: Session; family: Family }> {
  const session = await requireSessionForPage()
  const { active } = await resolveFamilies(session, (await cookies()).get(FAMILY_COOKIE)?.value)
  if (!active) redirect(SELECT_FAMILY_PATH)
  return { session, family: active }
}
