import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectDb, runMigrations, type Database, type Db } from '../db/client.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://abis:change-me@localhost:5432/abis_test';

/**
 * Real-PostgreSQL test harness (RULES.md #18). Call once at the top of a test file;
 * every test starts with empty tables. Returns a getter because the connection
 * opens in beforeAll.
 */
export function useTestDb(): () => Db {
  let database: Database | undefined;

  beforeAll(async () => {
    database = connectDb(TEST_DATABASE_URL);
    await runMigrations(database.db);
  });

  beforeEach(async () => {
    const db = getDb();
    const rows = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tables = rows.map((row) => `"${row.tablename}"`);
    if (tables.length > 0) {
      await db.execute(sql.raw(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`));
    }
  });

  afterAll(async () => {
    await database?.close();
  });

  function getDb(): Db {
    if (!database) throw new Error('useTestDb: database not connected yet (use inside tests)');
    return database.db;
  }

  return getDb;
}
