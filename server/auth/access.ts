import { getAccessStore } from '../access/store'
import { getAdminEmail } from '../env'

// Control de acceso: SOLO entran los correos de la lista que gestiona el administrador en /admin (más el propio
// administrador, que siempre puede, para que nadie se quede fuera de su propia app). Se comprueba al iniciar sesión
// y también en cada petición, para que quitar a alguien le cierre la sesión que ya tuviera abierta.
export const isAdminEmail = (email: string) => email.trim().toLowerCase() === getAdminEmail()

// La lista se guarda en memoria unos segundos para no ir a la BD en cada petición (cada ida y vuelta cuesta ~30 ms).
// Quitar a alguien tarda como mucho TTL_MS en notarse en otras instancias (y en las páginas respecto a las rutas de la API en
// desarrollo); en la misma, es inmediato (invalidateAccessCache). Dar acceso nunca espera: un "no" se vuelve a comprobar.
const TTL_MS = 30_000
let cache: { emails: Set<string>; at: number } | undefined
export const invalidateAccessCache = () => { cache = undefined }

async function refresh() {
  cache = { emails: new Set((await getAccessStore().list()).map(row => row.email)), at: Date.now() }
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const mail = email.trim().toLowerCase()
  if (isAdminEmail(mail)) return true
  if (!cache || Date.now() - cache.at > TTL_MS) await refresh()
  if (cache!.emails.has(mail)) return true
  // Un "no" guardado no puede dejar fuera a quien acaban de dar acceso (en desarrollo, las páginas y las rutas de la
  // API tienen cada una su propia copia de esta caché): antes de denegar se vuelve a leer la lista, como mucho cada 2 s.
  if (Date.now() - cache!.at > 2_000) await refresh()
  return cache!.emails.has(mail)
}
