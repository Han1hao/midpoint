import { readFile } from "node:fs/promises";
import { Pool } from "pg";

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;

function databaseUrl() {
  const value = process.env.GOVERNANCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) {
    throw new Error("未配置 GOVERNANCE_DATABASE_URL，平台无法连接 PostgreSQL");
  }
  return value;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Number(process.env.GOVERNANCE_DB_POOL_SIZE || 10),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ssl: process.env.GOVERNANCE_DB_SSL === "require" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function legacyData<T>(file: string, initial: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return structuredClone(initial);
  }
}

async function ensureInitialized<T>(file: string, initial: T) {
  if (!initialized) {
    initialized = (async () => {
      const db = getPool();
      await db.query("CREATE SCHEMA IF NOT EXISTS portal");
      await db.query(`
        CREATE TABLE IF NOT EXISTS portal.governance_state (
          id smallint PRIMARY KEY CHECK (id = 1),
          data jsonb NOT NULL,
          version bigint NOT NULL DEFAULT 1,
          migrated_from_json_at timestamptz,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      const seed = await legacyData(file, initial);
      await db.query(
        `INSERT INTO portal.governance_state (id, data, migrated_from_json_at)
         VALUES (1, $1::jsonb, now())
         ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(seed)],
      );
    })().catch(error => {
      initialized = undefined;
      throw error;
    });
  }
  await initialized;
}

export async function loadGovernanceState<T>(file: string, initial: T): Promise<T> {
  await ensureInitialized(file, initial);
  const result = await getPool().query<{ data: T }>(
    "SELECT data FROM portal.governance_state WHERE id = 1",
  );
  return result.rows[0]?.data ?? structuredClone(initial);
}

export async function saveGovernanceState<T>(state: T): Promise<void> {
  const result = await getPool().query(
    `UPDATE portal.governance_state
       SET data = $1::jsonb, version = version + 1, updated_at = now()
     WHERE id = 1`,
    [JSON.stringify(state)],
  );
  if (result.rowCount !== 1) throw new Error("PostgreSQL 治理数据尚未初始化");
}

