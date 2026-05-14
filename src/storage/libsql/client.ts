import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export function createDb(url: string, authToken?: string): { db: Db; client: Client } {
  const client = createClient({ url, authToken })
  const db = drizzle(client, { schema })
  return { db, client }
}
