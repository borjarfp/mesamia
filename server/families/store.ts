import { randomUUID } from 'node:crypto'
import { ConfigError } from '../errors'
import type { Family } from '../types'
import { DATA_FILE, deleteWeeksWhere, load, persist, serialized } from '../history/store'
import { createPostgresFamilyStore } from './postgres-store'
import { databaseUrl } from '../history/postgres-store'
import type { LocalDatabase } from '../db/tables'

// Persistencia de familias y de quién puede acceder a cada una. Igual que HistoryStore: una interfaz
// pequeña con dos implementaciones (Postgres si hay DATABASE_URL, JSON local si no). Las familias
// son SIEMPRE las reales, también en modo pruebas (server/test-mode.ts): el modo pruebas solo
// separa las semanas guardadas, no quién es de qué familia.
//
// La identidad de una persona es su correo de Google (en minúsculas): no hay tabla de usuarios.
export interface FamilyStore {
  listForUser(email: string): Promise<Family[]>
  // Las familias de `email`; si no tiene ninguna, le crea una (`defaultName`) para que siempre haya
  // al menos una. La primera familia que se crea en toda la BD adopta las semanas guardadas antes de
  // existir las familias (family_id NULL).
  ensureForUser(email: string, defaultName: string): Promise<Family[]>
  create(name: string, creatorEmail: string): Promise<Family>
  // Sustituye nombre y lista de miembros. null si la familia no existe.
  update(id: string, input: { name: string; members: string[] }): Promise<Family | null>
  // Borra la familia y sus semanas guardadas (y las recetas que se quedan sin usar).
  remove(id: string): Promise<boolean>
}

const normalize = (email: string) => email.trim().toLowerCase()

function toFamily(db: LocalDatabase, row: LocalDatabase['families'][number]): Family {
  const members = db.family_members.filter(member => member.family_id === row.id).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.email.localeCompare(b.email)).map(member => member.email)
  return { id: row.id, name: row.name, members, createdAt: row.created_at }
}

function familiesOf(db: LocalDatabase, email: string): Family[] {
  const mine = new Set(db.family_members.filter(member => member.email === email).map(member => member.family_id))
  return db.families.filter(row => mine.has(row.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(row => toFamily(db, row))
}

function addFamily(db: LocalDatabase, name: string, creatorEmail: string): LocalDatabase['families'][number] {
  const now = new Date().toISOString()
  const row = { id: randomUUID(), name, created_at: now }
  db.families.push(row)
  db.family_members.push({ family_id: row.id, email: creatorEmail, created_at: now })
  return row
}

function createLocalFamilyStore(file = DATA_FILE): FamilyStore {
  return {
    async listForUser(email) {
      return familiesOf(await load(file), normalize(email))
    },
    ensureForUser(email, defaultName) {
      return serialized(async () => {
        const db = await load(file)
        const mail = normalize(email)
        if (familiesOf(db, mail).length === 0) {
          const first = db.families.length === 0
          const row = addFamily(db, defaultName, mail)
          if (first) for (const week of db.saved_weeks) if (week.family_id === null) week.family_id = row.id
          await persist(file, db)
        }
        return familiesOf(db, mail)
      })
    },
    create(name, creatorEmail) {
      return serialized(async () => {
        const db = await load(file)
        const row = addFamily(db, name, normalize(creatorEmail))
        await persist(file, db)
        return toFamily(db, row)
      })
    },
    update(id, { name, members }) {
      return serialized(async () => {
        const db = await load(file)
        const row = db.families.find(item => item.id === id)
        if (!row) return null
        row.name = name
        const wanted = new Set(members.map(normalize))
        const kept = db.family_members.filter(member => member.family_id !== id || wanted.has(member.email))
        const have = new Set(kept.filter(member => member.family_id === id).map(member => member.email))
        const now = new Date().toISOString()
        db.family_members = [...kept, ...[...wanted].filter(email => !have.has(email)).map(email => ({ family_id: id, email, created_at: now }))]
        await persist(file, db)
        return toFamily(db, row)
      })
    },
    remove(id) {
      return serialized(async () => {
        const db = await load(file)
        if (!db.families.some(item => item.id === id)) return false
        db.families = db.families.filter(item => item.id !== id)
        db.family_members = db.family_members.filter(member => member.family_id !== id)
        deleteWeeksWhere(db, week => week.family_id === id)
        await persist(file, db)
        return true
      })
    },
  }
}

function createFamilyStore(): FamilyStore {
  if (databaseUrl()) return createPostgresFamilyStore()
  if (process.env.VERCEL) {
    const fail = () => Promise.reject(new ConfigError('Falta DATABASE_URL (o POSTGRES_URL) en las variables de entorno de Vercel: sin ella las familias no se pueden guardar.'))
    return { listForUser: fail, ensureForUser: fail, create: fail, update: fail, remove: fail }
  }
  return createLocalFamilyStore()
}

const store: FamilyStore = createFamilyStore()
export const getFamilyStore = (): FamilyStore => store
