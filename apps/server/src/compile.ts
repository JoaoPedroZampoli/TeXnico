import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as Y from "yjs";
import type { Hocuspocus } from "@hocuspocus/server";
import { asset, eq, getDb, inArray, project } from "@texcollab/db";
import {
  getContents,
  listFiles,
  readSettings,
  resolveMainFile,
  validateFileName,
  type Compiler,
} from "@texcollab/shared";
import { env } from "./env";
import { parseBibLog, parseLatexLog, type Diagnostic } from "./logparser";

export interface SnapshotFile {
  path: string;
  kind: "text" | "binary";
  content?: string;
  assetId?: string;
}

export interface ProjectSnapshot {
  files: SnapshotFile[];
  mainPath: string | null;
  compiler: Compiler;
}

/** Reads the current project state — from memory if someone is editing it, else from the DB. */
export async function snapshotProject(hocuspocus: Hocuspocus, projectId: string): Promise<ProjectSnapshot> {
  let doc: Y.Doc | undefined = hocuspocus.documents.get(projectId);
  let temporary = false;
  if (!doc) {
    const rows = await getDb().select({ ydoc: project.ydoc }).from(project).where(eq(project.id, projectId)).limit(1);
    if (!rows.length) throw new Error("Projeto não encontrado");
    doc = new Y.Doc();
    temporary = true;
    if (rows[0].ydoc) Y.applyUpdate(doc, rows[0].ydoc);
  }
  try {
    const contents = getContents(doc);
    const files: SnapshotFile[] = [];
    for (const f of listFiles(doc)) {
      if (f.kind === "text") files.push({ path: f.path, kind: "text", content: contents.get(f.id)?.toString() ?? "" });
      else if (f.kind === "binary" && f.assetId) files.push({ path: f.path, kind: "binary", assetId: f.assetId });
    }
    return { files, mainPath: resolveMainFile(doc)?.path ?? null, compiler: readSettings(doc).compiler };
  } finally {
    if (temporary) doc.destroy();
  }
}

/* ---------------- concurrency helpers ---------------- */

const projectLocks = new Map<string, Promise<unknown>>();
function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectLocks.get(projectId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  projectLocks.set(projectId, next);
  next.finally(() => {
    if (projectLocks.get(projectId) === next) projectLocks.delete(projectId);
  }).catch(() => {});
  return next;
}

let running = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= env.maxConcurrentCompiles) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/* ---------------- workspace sync ---------------- */

const MANIFEST = ".texcollab-manifest.json";
const projectDir = (projectId: string) => path.join(env.compileDir, "projects", projectId);
const outputDir = (projectId: string) => path.join(env.compileDir, "output", projectId);

function safeJoin(root: string, rel: string): string | null {
  if (rel.split("/").some((seg) => validateFileName(seg) !== null)) return null;
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

async function syncWorkspace(projectId: string, snapshot: ProjectSnapshot, clean: boolean) {
  const dir = projectDir(projectId);
  if (clean) await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  let manifest: Record<string, string> = {};
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, MANIFEST), "utf8"));
  } catch {}

  const next: Record<string, string> = {};
  const needAssets: { full: string; assetId: string }[] = [];

  for (const f of snapshot.files) {
    const full = safeJoin(dir, f.path);
    if (!full) continue;
    const key = f.kind === "text" ? "sha1:" + createHash("sha1").update(f.content ?? "").digest("hex") : "asset:" + f.assetId;
    next[f.path] = key;
    const exists = await fs.stat(full).then(() => true, () => false);
    if (manifest[f.path] === key && exists) continue;
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (f.kind === "text") await fs.writeFile(full, f.content ?? "");
    else needAssets.push({ full, assetId: f.assetId! });
  }

  if (needAssets.length) {
    const ids = [...new Set(needAssets.map((a) => a.assetId))];
    const rows = await getDb().select({ id: asset.id, data: asset.data }).from(asset).where(inArray(asset.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r.data]));
    for (const a of needAssets) {
      const data = byId.get(a.assetId);
      if (data) await fs.writeFile(a.full, data);
    }
  }

  // Remove sources that were deleted/renamed since the last compile.
  for (const old of Object.keys(manifest)) {
    if (next[old]) continue;
    const full = safeJoin(dir, old);
    if (full) await fs.rm(full, { force: true });
  }
  await fs.writeFile(path.join(dir, MANIFEST), JSON.stringify(next));
  return dir;
}

/* ---------------- running latexmk ---------------- */

interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

const TEX_ENV = {
  // Hardening: only TeX Live's restricted shell-escape whitelist (epstopdf, bibtex, makeindex…),
  // and no reading/writing outside the project directory.
  shell_escape: "p",
  openin_any: "p",
  openout_any: "p",
  // Do not wrap log lines at 79 chars — makes the log parseable.
  max_print_line: "10000",
  error_line: "254",
  half_error_line: "238",
};

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...TEX_ENV }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const append = (b: Buffer) => {
      if (output.length < 400_000) output += b.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, output: output + `\n${err.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}

const ENGINE_FLAG: Record<Compiler, string> = { pdflatex: "-pdf", xelatex: "-xelatex", lualatex: "-lualatex" };

export interface CompileResult {
  status: "success" | "error" | "failure";
  buildId: string | null;
  diagnostics: Diagnostic[];
  log: string;
  output: string;
  durationMs: number;
  timedOut: boolean;
  mainPath: string | null;
}

const latestBuild = new Map<string, { buildId: string; pdf: string; workdir: string; mainPath: string }>();

export function getBuild(projectId: string, buildId: string) {
  const b = latestBuild.get(projectId);
  return b && b.buildId === buildId ? b : null;
}

export function compileProject(hocuspocus: Hocuspocus, projectId: string, opts: { clean?: boolean } = {}) {
  return withProjectLock(projectId, () =>
    withSlot(async (): Promise<CompileResult> => {
      const started = Date.now();
      const snapshot = await snapshotProject(hocuspocus, projectId);
      if (!snapshot.mainPath) {
        return {
          status: "failure", buildId: null, log: "", output: "", durationMs: 0, timedOut: false, mainPath: null,
          diagnostics: [{ level: "error", file: null, line: null, message: "Nenhum arquivo principal (.tex com \\documentclass) encontrado. Defina um arquivo principal nas configurações." }],
        };
      }
      const dir = await syncWorkspace(projectId, snapshot, !!opts.clean);
      const mainFull = safeJoin(dir, snapshot.mainPath)!;
      const mainDir = path.dirname(mainFull);
      const jobname = path.basename(mainFull).replace(/\.[^.]+$/, "");
      const pdfPath = path.join(mainDir, `${jobname}.pdf`);

      const res = await run(
        "latexmk",
        ["-norc", ENGINE_FLAG[snapshot.compiler], "-interaction=nonstopmode", "-file-line-error", "-synctex=1", "-f", "-cd", mainFull],
        dir,
        env.compileTimeoutMs,
      );

      const log = await fs.readFile(path.join(mainDir, `${jobname}.log`), "utf8").catch(() => "");
      const blg = await fs.readFile(path.join(mainDir, `${jobname}.blg`), "utf8").catch(() => "");
      const relMainDir = path.relative(dir, mainDir);
      let diagnostics = parseLatexLog(log, mainDir).map((d) =>
        d.file && relMainDir ? { ...d, file: path.posix.join(relMainDir, d.file) } : d,
      );
      diagnostics = [...diagnostics, ...parseBibLog(blg)];
      if (res.timedOut) {
        diagnostics.unshift({ level: "error", file: null, line: null, message: `A compilação passou do limite de ${env.compileTimeoutMs / 1000}s e foi interrompida.` });
      } else if (res.code === -1) {
        diagnostics.unshift({ level: "error", file: null, line: null, message: "Não foi possível executar o latexmk. O TeX Live está instalado no servidor?" });
      }

      // When nothing changed, latexmk keeps the previous PDF ("All targets are up-to-date"); if TeX hit a
      // fatal error, the last good PDF is kept too — like Overleaf, we still show it alongside the errors.
      const after = await fs.stat(pdfPath).then((s) => s.mtimeMs, () => 0);
      const hasPdf = after > 0;
      let buildId: string | null = null;
      if (hasPdf && !res.timedOut) {
        buildId = randomUUID();
        const out = outputDir(projectId);
        await fs.rm(out, { recursive: true, force: true });
        await fs.mkdir(out, { recursive: true });
        const outPdf = path.join(out, `${buildId}.pdf`);
        await fs.copyFile(pdfPath, outPdf);
        latestBuild.set(projectId, { buildId, pdf: outPdf, workdir: dir, mainPath: snapshot.mainPath });
      }

      const hasErrors = diagnostics.some((d) => d.level === "error") || res.code !== 0;
      return {
        status: !buildId ? "failure" : hasErrors ? "error" : "success",
        buildId,
        diagnostics,
        log: log.slice(-300_000),
        output: res.output.slice(-100_000),
        durationMs: Date.now() - started,
        timedOut: res.timedOut,
        mainPath: snapshot.mainPath,
      };
    }),
  );
}

/* ---------------- SyncTeX ---------------- */

async function synctex(args: string[], cwd: string) {
  const res = await run("synctex", args, cwd, 10_000);
  if (res.code !== 0) return null;
  return res.output;
}

/** Source position → PDF boxes. */
export async function synctexForward(projectId: string, buildId: string, file: string, line: number, column: number) {
  const b = getBuild(projectId, buildId);
  if (!b) return null;
  const input = safeJoin(b.workdir, file);
  if (!input) return null;
  const mainDir = path.dirname(path.join(b.workdir, b.mainPath));
  const pdf = path.join(mainDir, path.basename(b.mainPath).replace(/\.[^.]+$/, ".pdf"));
  const out = await synctex(["view", "-i", `${line}:${column}:${input}`, "-o", pdf], mainDir);
  if (!out) return null;
  const boxes: { page: number; h: number; v: number; width: number; height: number }[] = [];
  let cur: Record<string, number> = {};
  for (const l of out.split("\n")) {
    const m = /^(Page|h|v|W|H):(.*)$/.exec(l.trim());
    if (!m) continue;
    if (m[1] === "Page" && cur.Page !== undefined) {
      boxes.push({ page: cur.Page, h: cur.h, v: cur.v, width: cur.W, height: cur.H });
      cur = {};
    }
    cur[m[1]] = Number(m[2]);
  }
  if (cur.Page !== undefined) boxes.push({ page: cur.Page, h: cur.h, v: cur.v, width: cur.W, height: cur.H });
  return boxes;
}

/** PDF position → source file/line. */
export async function synctexInverse(projectId: string, buildId: string, page: number, x: number, y: number) {
  const b = getBuild(projectId, buildId);
  if (!b) return null;
  const mainDir = path.dirname(path.join(b.workdir, b.mainPath));
  const pdf = path.join(mainDir, path.basename(b.mainPath).replace(/\.[^.]+$/, ".pdf"));
  const out = await synctex(["edit", "-o", `${page}:${x}:${y}:${pdf}`], mainDir);
  if (!out) return null;
  const input = /^Input:(.*)$/m.exec(out)?.[1];
  const line = Number(/^Line:(\d+)$/m.exec(out)?.[1] ?? NaN);
  if (!input || !Number.isFinite(line)) return null;
  const rel = path.relative(b.workdir, path.resolve(mainDir, input)).split(path.sep).join("/");
  if (rel.startsWith("..")) return null;
  return { file: rel, line };
}
