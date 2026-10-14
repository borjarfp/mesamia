import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { Family } from '../types'
import { ensureSchema, getPool, inTransaction } from '../history/postgres-store'
import { EMPTY_FAMILY_RULES } from '../rules/family-rules'
import { parseStoredRules } from '../rules/family-rules-schema'
import type { FamilyStore } from './store'

// FamilyStore sobre Postgres (tablas families y family_members de server/db/schema.sql). El esquema
// se asegura solo, una vez por proceso (ensureSchema), igual que el del historial.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const normalize = (email: string) => email.trim().toLowerCase()

type FamilyRecord = { id: string; name: string; children: string[]; created_at: Date }

async function loadFamilies(rows: FamilyRecord[], run: Pick<PoolClient, 'query'> = getPool()): Promise<Family[]> {
  if (rows.length === 0) return []
  const { rows: members } = await run.query<{ family_id: string; email: string }>('SELECT family_id, email FROM family_members WHERE family_id = ANY($1::uuid[]) ORDER BY created_at, email', [rows.map(row => row.id)])
  return rows.map(row => ({ id: row.id, name: row.name, members: members.filter(member => member.family_id === row.id).map(member => member.email), children: row.children ?? [], createdAt: row.created_at.toISOString() }))
}

// Las familias de una persona con sus miembros en UNA consulta (esto se ejecuta en cada petición a
// la API, para comprobar la familia activa): cada ida y vuelta a Supabase cuesta ~30 ms.
const listFor = async (email: string, run: Pick<PoolClient, 'query'> = getPool()): Promise<Family[]> => {
  const { rows } = await run.query<FamilyRecord & { members: string[] }>(
    `SELECT f.id, f.name, f.children, f.created_at,
            (SELECT COALESCE(json_agg(m.email ORDER BY m.created_at, m.email), '[]'::json) FROM family_members m WHERE m.family_id = f.id) AS members
       FROM families f WHERE EXISTS (SELECT 1 FROM family_members me WHERE me.family_id = f.id AND me.email = $1) ORDER BY f.created_at`, [email])
  return rows.map(row => ({ id: row.id, name: row.name, members: row.members, children: row.children ?? [], createdAt: row.created_at.toISOString() }))
}

async function insertFamily(client: PoolClient, name: string, creatorEmail: string): Promise<string> {
  const id = randomUUID()
  await client.query('INSERT INTO families (id, name) VALUES ($1, $2)', [id, name])
  await client.query('INSERT INTO family_members (family_id, email) VALUES ($1, $2)', [id, creatorEmail])
  // Una familia nueva empieza SIN reglas (se guardan vacías: sin fila se aplicarían las de siempre).
  await client.query('INSERT INTO family_rules (family_id, rules) VALUES ($1, $2::jsonb)', [id, JSON.stringify(EMPTY_FAMILY_RULES)])
  return id
}

export function createPostgresFamilyStore(): FamilyStore {
  return {
    async listForUser(email) {
      await ensureSchema()
      return listFor(normalize(email))
    },
    async ensureForUser(email, defaultName) {
      await ensureSchema()
      const mail = normalize(email)
      const existing = await listFor(mail)
      if (existing.length > 0) return existing
      return inTransaction(async client => {
        // Un lock global (no por usuario): "¿es la primera familia de toda la BD?" tiene que decidirse
        // sin que dos personas a la vez crean que lo son.
        await client.query('SELECT pg_advisory_xact_lock(727272)')
        const current = await listFor(mail, client)
        if (current.length > 0) return current
        const { rows } = await client.query<{ count: string }>('SELECT count(*) FROM families')
        const id = await insertFamily(client, defaultName, mail)
        // La primera familia adopta las semanas guardadas antes de existir las familias.
        if (rows[0].count === '0') await client.query('UPDATE saved_weeks SET family_id = $1 WHERE family_id IS NULL', [id])
        return listFor(mail, client)
      })
    },
    async create(name, creatorEmail) {
      await ensureSchema()
      return inTransaction(async client => {
        const id = await insertFamily(client, name, normalize(creatorEmail))
        return (await loadFamilies((await client.query<FamilyRecord>('SELECT id, name, children, created_at FROM families WHERE id = $1', [id])).rows, client))[0]
      })
    },
    async update(id, { name, members, children }) {
      if (!UUID.test(id)) return null
      await ensureSchema()
      return inTransaction(async client => {
        // Solo se toca lo que venga (nombre, hijos e hijas y/o miembros).
        const { rowCount } = await client.query('UPDATE families SET name = COALESCE($2, name), children = COALESCE($3::jsonb, children) WHERE id = $1', [id, name ?? null, children === undefined ? null : JSON.stringify(children)])
        if (!rowCount) return null
        if (members !== undefined) {
          const wanted = [...new Set(members.map(normalize))]
          await client.query('DELETE FROM family_members WHERE family_id = $1 AND NOT (email = ANY($2::text[]))', [id, wanted])
          for (const email of wanted) await client.query('INSERT INTO family_members (family_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, email])
        }
        return (await loadFamilies((await client.query<FamilyRecord>('SELECT id, name, children, created_at FROM families WHERE id = $1', [id])).rows, client))[0]
      })
    },
    async getRules(familyId) {
      if (!UUID.test(familyId)) return parseStoredRules(undefined)
      await ensureSchema()
      const { rows } = await getPool().query<{ rules: unknown }>('SELECT rules FROM family_rules WHERE family_id = $1', [familyId])
      return parseStoredRules(rows[0]?.rules)
    },
    async setRules(familyId, rules) {
      await ensureSchema()
      await getPool().query('INSERT INTO family_rules (family_id, rules) VALUES ($1, $2::jsonb) ON CONFLICT (family_id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = now()', [familyId, JSON.stringify(rules)])
    },
    async remove(id) {
      if (!UUID.test(id)) return false
      await ensureSchema()
      return inTransaction(async client => {
        // CASCADE: family_members y saved_weeks (y de ahí week_meals).
        const { rowCount } = await client.query('DELETE FROM families WHERE id = $1', [id])
        if (!rowCount) return false
        // Recetas que ninguna semana usa ya (sus ingredientes y pasos caen por CASCADE).
        await client.query('DELETE FROM recipes r WHERE NOT EXISTS (SELECT 1 FROM week_meals m WHERE m.recipe_id = r.id)')
        return true
      })
    },
  }
}
