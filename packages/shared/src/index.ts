import * as Y from "yjs";

export * from "./templates";

/**
 * A project is a single Y.Doc with four top-level shared types:
 *  - files:    Y.Map<FileEntry>  — the file tree (folders, text files, binary assets)
 *  - contents: Y.Map<Y.Text>     — the text content of every text file, keyed by file id
 *  - settings: Y.Map<unknown>    — project settings (main file, compiler)
 *  - chat:     Y.Array<ChatMessage>
 *
 * Binary files (images, PDFs…) live in the database; the tree only references them by assetId.
 */

export type FileKind = "folder" | "text" | "binary";

export interface FileEntry {
  id: string;
  name: string;
  parentId: string | null;
  kind: FileKind;
  assetId?: string;
  size?: number;
  mime?: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  color: string;
  text: string;
  at: number;
}

export type Compiler = "pdflatex" | "xelatex" | "lualatex";
export const COMPILERS: Compiler[] = ["pdflatex", "xelatex", "lualatex"];

export interface ProjectSettings {
  mainFileId: string | null;
  compiler: Compiler;
}

export const getFiles = (doc: Y.Doc) => doc.getMap<FileEntry>("files");
export const getContents = (doc: Y.Doc) => doc.getMap<Y.Text>("contents");
export const getSettingsMap = (doc: Y.Doc) => doc.getMap<unknown>("settings");
export const getChat = (doc: Y.Doc) => doc.getArray<ChatMessage>("chat");

export function readSettings(doc: Y.Doc): ProjectSettings {
  const s = getSettingsMap(doc);
  const compiler = s.get("compiler");
  return {
    mainFileId: (s.get("mainFileId") as string | undefined) ?? null,
    compiler: COMPILERS.includes(compiler as Compiler) ? (compiler as Compiler) : "pdflatex",
  };
}

export const newId = () => globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);

const TEXT_EXTENSIONS = new Set([
  "tex", "bib", "cls", "sty", "bst", "bbx", "cbx", "lbx", "txt", "md", "csv", "tsv", "dat",
  "tikz", "pgf", "def", "cfg", "clo", "dtx", "ins", "ltx", "latexmkrc", "json", "yaml", "yml",
  "asy", "gp", "plt", "py", "r", "m", "lua", "xml", "svg", "ist", "glo", "gls", "nlo", "rnw",
]);

export function isTextFileName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return true; // files like "README" or "Makefile"
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** File names that could be used to execute code during compilation. */
const FORBIDDEN_NAMES = new Set(["latexmkrc", ".latexmkrc"]);

/** Returns an error message (pt-BR) or null when the name is valid. */
export function validateFileName(name: string): string | null {
  const n = name.trim();
  if (!n) return "O nome não pode ficar vazio.";
  if (n.length > 120) return "Nome muito longo.";
  if (n === "." || n === "..") return "Nome inválido.";
  if (/[\/\\\x00-\x1f:*?"<>|]/.test(n)) return 'O nome não pode conter / \\ : * ? " < > |';
  if (FORBIDDEN_NAMES.has(n.toLowerCase())) return "Esse nome de arquivo não é permitido.";
  return null;
}

/** Full path of a file inside the project, e.g. "chapters/intro.tex". Returns null for orphans/cycles. */
export function filePath(files: Map<string, FileEntry> | Y.Map<FileEntry>, id: string): string | null {
  const parts: string[] = [];
  let cur = files.get(id);
  let guard = 0;
  while (cur) {
    parts.unshift(cur.name);
    if (cur.parentId === null) return parts.join("/");
    cur = files.get(cur.parentId);
    if (++guard > 64) return null;
  }
  return null;
}

export interface ResolvedFile extends FileEntry {
  path: string;
}

export function listFiles(doc: Y.Doc): ResolvedFile[] {
  const files = getFiles(doc);
  const out: ResolvedFile[] = [];
  files.forEach((entry, id) => {
    const path = filePath(files, id);
    if (path) out.push({ ...entry, path });
  });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function findChild(doc: Y.Doc, parentId: string | null, name: string): FileEntry | undefined {
  let found: FileEntry | undefined;
  getFiles(doc).forEach((f) => {
    if (f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()) found = f;
  });
  return found;
}

/** Ids of the entry and all of its descendants. */
export function descendantIds(doc: Y.Doc, id: string): string[] {
  const files = getFiles(doc);
  const result = [id];
  for (let i = 0; i < result.length; i++) {
    files.forEach((f) => {
      if (f.parentId === result[i]) result.push(f.id);
    });
  }
  return result;
}

export function createTextFile(doc: Y.Doc, parentId: string | null, name: string, content = ""): FileEntry {
  const entry: FileEntry = { id: newId(), name, parentId, kind: "text", createdAt: Date.now() };
  doc.transact(() => {
    const text = new Y.Text();
    text.insert(0, content);
    getContents(doc).set(entry.id, text);
    getFiles(doc).set(entry.id, entry);
  });
  return entry;
}

export function createFolder(doc: Y.Doc, parentId: string | null, name: string): FileEntry {
  const entry: FileEntry = { id: newId(), name, parentId, kind: "folder", createdAt: Date.now() };
  getFiles(doc).set(entry.id, entry);
  return entry;
}

export function deleteEntry(doc: Y.Doc, id: string) {
  const ids = descendantIds(doc, id);
  doc.transact(() => {
    const files = getFiles(doc);
    const contents = getContents(doc);
    const settings = getSettingsMap(doc);
    for (const i of ids) {
      files.delete(i);
      contents.delete(i);
      if (settings.get("mainFileId") === i) settings.delete("mainFileId");
    }
  });
}

export function updateEntry(doc: Y.Doc, id: string, patch: Partial<Pick<FileEntry, "name" | "parentId">>) {
  const files = getFiles(doc);
  const cur = files.get(id);
  if (!cur) return;
  files.set(id, { ...cur, ...patch });
}

/** The configured main file, or a sensible fallback (main.tex, then any .tex with \documentclass). */
export function resolveMainFile(doc: Y.Doc): ResolvedFile | null {
  const all = listFiles(doc).filter((f) => f.kind === "text");
  const { mainFileId } = readSettings(doc);
  const configured = all.find((f) => f.id === mainFileId);
  if (configured) return configured;
  const byName = all.find((f) => f.path === "main.tex");
  if (byName) return byName;
  const contents = getContents(doc);
  return (
    all.find((f) => f.path.endsWith(".tex") && /\\documentclass/.test(contents.get(f.id)?.toString() ?? "")) ?? null
  );
}

/** Deterministic user colour from an id. */
export function colorForUser(id: string): { color: string; colorLight: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { color: `hsl(${hue} 70% 45%)`, colorLight: `hsl(${hue} 70% 45% / 0.2)` };
}
