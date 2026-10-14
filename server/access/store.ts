import { getAdminEmail } from '../env'
import { ConfigError } from '../errors'
import { DATA_FILE, load, persist, serialized } from '../history/store'
import { databaseUrl } from '../history/postgres-store'
import { createPostgresAccessStore } from './postgres-store'

// Quién puede entrar a la app (lista de correos que gestiona el administrador en /admin). Igual que el resto de
// stores: una interfaz pequeña con Postgres si hay DATABASE_URL y el JSON local si no. Es siempre el real, también
// en modo pruebas.
export type AllowedEmail = { email: string; addedBy: string; createdAt: string }

export interface AccessStore {
  list(): Promise<AllowedEmail[]>
  // false si ya estaba.
  add(email: string, addedBy: string): Promise<boolean>
  // false si no estaba.
  remove(email: string): Promise<boolean>
}

const normalize = (email: string) => email.trim().toLowerCase()

function createLocalAccessStore(file = DATA_FILE): AccessStore {
  // Primera vez (fichero sin `access_seeded`): se siembra con los correos que ya estaban en alguna familia.
  const seedIfNeeded = (db: Awaited<ReturnType<typeof load>>) => {
    if (db.access_seeded) return false
    const now = new Date().toISOString()
    // (El administrador no se siembra: ya tiene acceso siempre.)
    for (const email of new Set(db.family_members.map(member => normalize(member.email)))) if (email !== getAdminEmail() && !db.allowed_emails.some(row => row.email === email)) db.allowed_emails.push({ email, added_by: 'migración', created_at: now })
    db.access_seeded = true
    return true
  }
  const mapRows = (rows: Awaited<ReturnType<typeof load>>['allowed_emails']): AllowedEmail[] => [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.email.localeCompare(b.email)).map(row => ({ email: row.email, addedBy: row.added_by, createdAt: row.created_at }))
  return {
    list() {
      return serialized(async () => {
        const db = await load(file)
        if (seedIfNeeded(db)) await persist(file, db)
        return mapRows(db.allowed_emails)
      })
    },
    add(email, addedBy) {
      return serialized(async () => {
        const db = await load(file)
        seedIfNeeded(db)
        const mail = normalize(email)
        if (db.allowed_emails.some(row => row.email === mail)) { await persist(file, db); return false }
        db.allowed_emails.push({ email: mail, added_by: normalize(addedBy), created_at: new Date().toISOString() })
        await persist(file, db)
        return true
      })
    },
    remove(email) {
      return serialized(async () => {
        const db = await load(file)
        seedIfNeeded(db)
        const mail = normalize(email)
        const before = db.allowed_emails.length
        db.allowed_emails = db.allowed_emails.filter(row => row.email !== mail)
        await persist(file, db)
        return db.allowed_emails.length < before
      })
    },
  }
}

function createAccessStore(): AccessStore {
  if (databaseUrl()) return createPostgresAccessStore()
  if (process.env.VERCEL) {
    const fail = () => Promise.reject(new ConfigError('Falta DATABASE_URL (o POSTGRES_URL) en las variables de entorno de Vercel: sin ella la lista de acceso no se puede leer.'))
    return { list: fail, add: fail, remove: fail }
  }
  return createLocalAccessStore()
}

const store: AccessStore = createAccessStore()
export const getAccessStore = (): AccessStore => store
