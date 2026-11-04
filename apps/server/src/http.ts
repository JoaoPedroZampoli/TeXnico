import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import JSZip from "jszip";
import type { Hocuspocus } from "@hocuspocus/server";
import { and, asset, eq, getDb, newAssetId } from "./db";
import {
  createTextFile,
  findChild,
  getContents,
  getFiles,
  isTextFileName,
  newId,
  validateFileName,
  type FileEntry,
} from "@texcollab/shared";
import * as Y from "yjs";
import { HttpError, requireRole, verifyToken, type TokenUser } from "./auth";
import { compileProject, getBuild, snapshotProject, synctexForward, synctexInverse } from "./compile";
import { env } from "./env";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", pdf: "application/pdf", eps: "application/postscript", ttf: "font/ttf",
  otf: "font/otf", woff: "font/woff", zip: "application/zip",
};
const mimeFor = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

type Authed = Request & { user: TokenUser };

export function createApp(hocuspocus: Hocuspocus) {
  const app = express();
  app.disable("x-powered-by");

  // CORS — the web app lives on a different origin (e.g. Vercel).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (env.webOrigins.includes(origin) || env.webOrigins.includes("*"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return void res.status(204).end();
    next();
  });

  app.get(["/", "/health"], (_req, res) => {
    res.json({ ok: true, documents: hocuspocus.getDocumentsCount(), connections: hocuspocus.getConnectionsCount() });
  });

  const auth = async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : (req.query.token as string | undefined);
    (req as Authed).user = await verifyToken(token);
    next();
  };
  const read = async (req: Request, _res: Response, next: NextFunction) => {
    await requireRole(String(req.params.id), (req as Authed).user.userId, false);
    next();
  };
  const write = async (req: Request, _res: Response, next: NextFunction) => {
    await requireRole(String(req.params.id), (req as Authed).user.userId, true);
    next();
  };

  const json = express.json({ limit: "100kb" });

  /* ---------- compile ---------- */

  app.post("/projects/:id/compile", auth, read, json, async (req, res) => {
    const result = await compileProject(hocuspocus, String(req.params.id), { clean: !!req.body?.clean });
    res.json(result);
  });

  app.get("/projects/:id/builds/:buildId/output.pdf", auth, read, (req, res) => {
    const build = getBuild(String(req.params.id), String(req.params.buildId));
    if (!build) throw new HttpError(404, "Compilação não encontrada — compile novamente.");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (req.query.download) res.setHeader("Content-Disposition", 'attachment; filename="output.pdf"');
    fs.createReadStream(build.pdf).pipe(res);
  });

  app.post("/projects/:id/synctex/forward", auth, read, json, async (req, res) => {
    const { buildId, file, line, column } = req.body ?? {};
    const boxes = await synctexForward(String(req.params.id), String(buildId), String(file), Number(line) || 1, Number(column) || 0);
    res.json({ boxes: boxes ?? [] });
  });

  app.post("/projects/:id/synctex/inverse", auth, read, json, async (req, res) => {
    const { buildId, page, x, y } = req.body ?? {};
    const pos = await synctexInverse(String(req.params.id), String(buildId), Number(page), Number(x), Number(y));
    res.json({ position: pos });
  });

  /* ---------- files ---------- */

  app.post(
    "/projects/:id/upload",
    auth,
    write,
    express.raw({ type: () => true, limit: env.maxUploadBytes }),
    async (req, res) => {
      const projectId = String(req.params.id);
      const name = String(req.query.name ?? "").trim();
      const parentId = req.query.parentId ? String(req.query.parentId) : null;
      const err = validateFileName(name);
      if (err) throw new HttpError(400, err);
      const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const isText = isTextFileName(name) && !body.subarray(0, 8000).includes(0);

      let assetId: string | undefined;
      let oldAssetId: string | undefined;
      if (!isText) {
        assetId = newAssetId();
        await getDb().insert(asset).values({ id: assetId, projectId, data: body, mime: mimeFor(name), size: body.length });
      }

      const conn = await hocuspocus.openDirectConnection(projectId, { system: true });
      let fileId = "";
      try {
        await conn.transact((doc) => {
          if (parentId && getFiles(doc).get(parentId)?.kind !== "folder") throw new HttpError(400, "Pasta inválida");
          const existing = findChild(doc, parentId, name);
          if (existing?.kind === "folder") throw new HttpError(409, "Já existe uma pasta com esse nome");
          if (isText) {
            const textContent = body.toString("utf8");
            if (existing?.kind === "text") {
              const t = getContents(doc).get(existing.id);
              if (t) {
                t.delete(0, t.length);
                t.insert(0, textContent);
              } else {
                const nt = new Y.Text();
                nt.insert(0, textContent);
                getContents(doc).set(existing.id, nt);
              }
              fileId = existing.id;
              return;
            }
            if (existing) getFiles(doc).delete(existing.id);
            fileId = createTextFile(doc, parentId, name, textContent).id;
          } else {
            if (existing?.kind === "text") {
              getFiles(doc).delete(existing.id);
              getContents(doc).delete(existing.id);
            }
            oldAssetId = existing?.kind === "binary" ? existing.assetId : undefined;
            const entry: FileEntry = {
              id: existing?.kind === "binary" ? existing.id : newId(),
              name,
              parentId,
              kind: "binary",
              assetId,
              size: body.length,
              mime: mimeFor(name),
              createdAt: existing?.createdAt ?? Date.now(),
            };
            getFiles(doc).set(entry.id, entry);
            fileId = entry.id;
          }
        });
      } finally {
        await conn.disconnect();
      }
      if (oldAssetId) await getDb().delete(asset).where(and(eq(asset.id, oldAssetId), eq(asset.projectId, projectId)));
      res.json({ fileId });
    },
  );

  app.get("/projects/:id/assets/:assetId", auth, read, async (req, res) => {
    const rows = await getDb()
      .select({ data: asset.data, mime: asset.mime })
      .from(asset)
      .where(and(eq(asset.id, String(req.params.assetId)), eq(asset.projectId, String(req.params.id))))
      .limit(1);
    if (!rows.length) throw new HttpError(404, "Arquivo não encontrado");
    res.setHeader("Content-Type", rows[0].mime);
    res.setHeader("Cache-Control", "private, max-age=86400, immutable");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(Buffer.from(rows[0].data));
  });

  app.get("/projects/:id/download.zip", auth, read, async (req, res) => {
    const projectId = String(req.params.id);
    const snap = await snapshotProject(hocuspocus, projectId);
    const zip = new JSZip();
    const assetIds = snap.files.filter((f) => f.kind === "binary").map((f) => f.assetId!);
    const assets = new Map<string, Uint8Array>();
    for (const id of assetIds) {
      const rows = await getDb().select({ data: asset.data }).from(asset).where(eq(asset.id, id)).limit(1);
      if (rows[0]) assets.set(id, rows[0].data);
    }
    for (const f of snap.files) {
      if (f.kind === "text") zip.file(f.path, f.content ?? "");
      else if (assets.has(f.assetId!)) zip.file(f.path, assets.get(f.assetId!)!);
    }
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="projeto.zip"');
    res.send(buf);
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Não encontrado" });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    const e = err as { type?: string; status?: number };
    if (e?.type === "entity.too.large") {
      return void res.status(413).json({ error: `Arquivo maior que ${env.maxUploadBytes / 1024 / 1024} MB` });
    }
    console.error(err);
    res.status(500).json({ error: "Erro interno do servidor" });
  });

  return app;
}
