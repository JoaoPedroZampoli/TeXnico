import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export { and, eq, desc, inArray, lt, notInArray, or, sql } from "drizzle-orm";

export type DB = ReturnType<typeof createDb>;

export function createDb(url: string, opts: { max?: number } = {}) {
  // prepare: false keeps us compatible with transaction poolers (Neon/Supabase pgbouncer).
  const client = postgres(url, { max: opts.max ?? 5, prepare: false });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as unknown as { __texcollabDb?: DB };

/** Process-wide singleton (survives Next.js hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__texcollabDb) {
    let url = process.env.DATABASE_URL;
    if (!url) {
      // Don't crash at import time (e.g. during `next build`); queries will fail with a clear log line.
      console.error("[db] DATABASE_URL não está definido — configure a variável de ambiente.");
      url = "postgres://database-url-not-set@127.0.0.1:1/missing";
    }
    globalForDb.__texcollabDb = createDb(url);
  }
  return globalForDb.__texcollabDb;
}
