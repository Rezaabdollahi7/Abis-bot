import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

export interface Database {
  db: Db;
  close: () => Promise<void>;
}

export function connectDb(url: string): Database {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  return { db: drizzle(client, { schema, casing: 'snake_case' }), close: () => client.end() };
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Applies pending migrations; runs at boot and before tests. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
