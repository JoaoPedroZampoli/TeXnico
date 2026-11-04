import os from "node:os";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] variável de ambiente obrigatória ausente: ${name}`);
    process.exit(1);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  realtimeSecret: new TextEncoder().encode(required("REALTIME_SECRET")),
  /** Allowed browser origins (comma separated). */
  webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  compileDir: path.resolve(process.env.COMPILE_DIR ?? path.join(os.tmpdir(), "texcollab-compiles")),
  compileTimeoutMs: Number(process.env.COMPILE_TIMEOUT_SECONDS ?? 90) * 1000,
  maxConcurrentCompiles: Number(process.env.MAX_CONCURRENT_COMPILES ?? 2),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
  runMigrations: process.env.RUN_MIGRATIONS !== "false",
};
