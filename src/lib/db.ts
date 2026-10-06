import fs from "node:fs";
import path from "node:path";

/**
 * Minimal database access shared by Postgres (Supabase/production) and an
 * embedded PGlite instance (local dev and tests).
 *
 *   DATABASE_URL=postgres://…   → node-postgres pool
 *   DATABASE_URL=memory://      → throwaway in-memory PGlite (tests)
 *   DATABASE_URL unset          → PGlite persisted in ./.data/pglite
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

const DATE_OID = 1082;
const NUMERIC_OID = 1700;
const INT8_OID = 20;

export function schemaSql(): string {
  return fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

async function createPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  // Match the node-postgres parsers below (global PGlite parsers are not applied in 0.5.x).
  const parsers = {
    [DATE_OID]: (v: string) => v,
    [NUMERIC_OID]: (v: string) => Number(v),
    [INT8_OID]: (v: string) => Number(v),
  };
  await pg.exec(schemaSql());
  const wrap = (q: { query: typeof pg.query }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await q.query<T>(sql, params, { parsers });
      return res.rows;
    },
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
    exec: async (sql) => {
      await pg.exec(sql);
    },
  };
}

async function createPg(url: string): Promise<Database> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(DATE_OID, (v) => v);
  types.setTypeParser(NUMERIC_OID, (v) => Number(v));
  types.setTypeParser(INT8_OID, (v) => Number(v));
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    ssl: /sslmode=require|supabase/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({
          async query<T>(sql: string, params: unknown[] = []) {
            const res = await client.query(sql, params);
            return res.rows as T[];
          },
        });
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
  };
}

const globalForDb = globalThis as unknown as { __db?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalForDb.__db) {
    const url = process.env.DATABASE_URL?.trim();
    globalForDb.__db = !url
      ? createPglite(path.join(process.cwd(), ".data", "pglite"))
      : url === "memory://"
        ? createPglite()
        : createPg(url);
    globalForDb.__db.catch(() => {
      globalForDb.__db = undefined;
    });
  }
  return globalForDb.__db;
}

/** Tests: drop the cached connection so the next getDb() starts fresh. */
export function resetDbForTests() {
  globalForDb.__db = undefined;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
  return (await getDb()).query<T>(sql, params);
}

export async function one<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
