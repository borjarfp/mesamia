import { ensureSchema, getPool } from '../history/postgres-store'
import type { AccessStore } from './store'

// AccessStore sobre Postgres (tabla allowed_emails de server/db/schema.sql; ensureSchema la crea y siembra solo).
export function createPostgresAccessStore(): AccessStore {
  return {
    async list() {
      await ensureSchema()
      const { rows } = await getPool().query<{ email: string; added_by: string; created_at: Date }>('SELECT email, added_by, created_at FROM allowed_emails ORDER BY created_at, email')
      return rows.map(row => ({ email: row.email, addedBy: row.added_by, createdAt: row.created_at.toISOString() }))
    },
    async add(email, addedBy) {
      await ensureSchema()
      const { rowCount } = await getPool().query('INSERT INTO allowed_emails (email, added_by) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email.trim().toLowerCase(), addedBy.trim().toLowerCase()])
      return !!rowCount
    },
    async remove(email) {
      await ensureSchema()
      const { rowCount } = await getPool().query('DELETE FROM allowed_emails WHERE email = $1', [email.trim().toLowerCase()])
      return !!rowCount
    },
  }
}
