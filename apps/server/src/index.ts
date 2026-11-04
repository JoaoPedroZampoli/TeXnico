import fs from "node:fs/promises";
import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { runMigrations } from "@texcollab/db/migrate";
import { getFiles } from "@texcollab/shared";
import * as Y from "yjs";
import { and, asset, eq, getDb, lt, notInArray, project } from "./db";
import { getRole, verifyToken } from "./auth";
import { env } from "./env";
import { createApp } from "./http";

if (env.runMigrations) {
  await runMigrations(env.databaseUrl);
  console.log("[db] migrações aplicadas");
}
await fs.mkdir(env.compileDir, { recursive: true });

const lastGc = new Map<string, number>();

/** Deletes uploaded files that are no longer referenced by the project tree. */
async function collectGarbage(projectId: string, doc: Y.Doc) {
  const now = Date.now();
  if (now - (lastGc.get(projectId) ?? 0) < 10 * 60_000) return;
  lastGc.set(projectId, now);
  const referenced: string[] = [];
  getFiles(doc).forEach((f) => f.assetId && referenced.push(f.assetId));
  const conds = [eq(asset.projectId, projectId), lt(asset.createdAt, new Date(now - 60 * 60_000))];
  if (referenced.length) conds.push(notInArray(asset.id, referenced));
  await getDb().delete(asset).where(and(...conds));
}

interface Ctx {
  userId?: string;
  system?: boolean;
}

const server = new Server<Ctx>({
  port: env.port,
  address: "0.0.0.0",
  quiet: true,
  debounce: 2000,
  maxDebounce: 10000,
  websocketOptions: { maxPayload: 20 * 1024 * 1024 },

  async onAuthenticate({ token, documentName, connectionConfig }) {
    const user = await verifyToken(token);
    const role = await getRole(documentName, user.userId);
    if (!role) throw new Error("forbidden");
    connectionConfig.readOnly = role === "viewer";
    return { userId: user.userId };
  },

  // Plain HTTP requests are handled by the Express app.
  async onRequest({ request, response }) {
    app(request, response);
    throw null; // stop Hocuspocus from writing its default response
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const rows = await getDb().select({ ydoc: project.ydoc }).from(project).where(eq(project.id, documentName)).limit(1);
        return rows[0]?.ydoc ?? null;
      },
      async store({ documentName, state, document }) {
        await getDb().update(project).set({ ydoc: state, updatedAt: new Date() }).where(eq(project.id, documentName));
        collectGarbage(documentName, document).catch((e) => console.error("[gc]", e));
      },
    }),
  ],
});

const app = createApp(server.hocuspocus);

await server.listen();
console.log(`[server] ouvindo em http://0.0.0.0:${env.port} (origens permitidas: ${env.webOrigins.join(", ")})`);
