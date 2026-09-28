// Aplica server/db/schema.sql a la BD de DATABASE_URL_DIRECT (una sola vez; falla si ya existe).
// Uso: pnpm db:migrate   (carga .env.local con `node --env-file`)
import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL_DIRECT en .env.local')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query('BEGIN')
  await client.query(await readFile(new URL('../server/db/schema.sql', import.meta.url), 'utf-8'))
  await client.query('COMMIT')
  console.log('Esquema aplicado.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
