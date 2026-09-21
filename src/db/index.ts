import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "@/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __soliDb?: Database;
  __soliSql?: postgres.Sql;
};

function createClient(): { db: Database; sql: postgres.Sql } {
  // Single connection is sufficient for a single-user dev tool and avoids
  // connection-pool exhaustion from concurrent route handlers.
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

const client =
  globalForDb.__soliDb && globalForDb.__soliSql
    ? { db: globalForDb.__soliDb, sql: globalForDb.__soliSql }
    : createClient();

if (env.NODE_ENV !== "production") {
  globalForDb.__soliDb = client.db;
  globalForDb.__soliSql = client.sql;
}

export const db = client.db;

export const sql = client.sql;