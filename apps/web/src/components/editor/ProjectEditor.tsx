"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRightToLine,
  ChevronDown,
  Code2,
  Download,
  Eye,
  FileArchive,
  FileDown,
  FolderTree,
  MessageSquare,
  MoreVertical,
  PanelLeft,
  Play,
  RefreshCw,
  Settings2,
  Share2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { COMPILERS, getContents, getSettingsMap, resolveMainFile, type Compiler, type ResolvedFile } from "@texcollab/shared";
import { renameProject } from "@/lib/actions";
import { Avatar, Button, cn, Logo, Menu, MenuItem, Spinner } from "../ui";
import { ChatPanel } from "./ChatPanel";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { FileTree } from "./FileTree";
import { useChat, useCollab, useFiles, usePresence, useSettings, type Me } from "./hooks";
import { LogPanel } from "./LogPanel";
import { PdfViewer } from "./PdfViewer";
import { api, saveBlob } from "./realtime";
import { ShareDialog } from "./ShareDialog";
import type { CompileResult, Diagnostic, SynctexBox } from "./types";

type Role = "owner" | "editor" | "viewer";

const COMPILER_LABEL: Record<Compiler, string> = { pdflatex: "pdfLaTeX", xelatex: "XeLaTeX", lualatex: "LuaLaTeX" };

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {}
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
    [key],
  );
  return [value, set] as const;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

export function ProjectEditor({ projectId, projectName, role, me }: { projectId: string; projectName: string; role: Role; me: Me }) {
  const router = useRouter();
  const { collab, status, synced } = useCollab(projectId, me);
  const doc = collab?.doc ?? null;
  const files = useFiles(doc);
  const settings = useSettings(doc);
  const chat = useChat(doc);
  const presence = usePresence(collab?.provider ?? null, me.id);
  const readOnly = role === "viewer";
  const isMobile = useIsMobile();

  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [highlight, setHighlight] = useState<{ boxes: SynctexBox[]; nonce: number } | null>(null);
  const [autoCompile, setAutoCompile] = useLocalStorage("texcollab:autoCompile", false);
  const [lastFile, setLastFile] = useLocalStorage<string | null>(`texcollab:lastFile:${projectId}`, null);
  const [mobileView, setMobileView] = useState<"files" | "code" | "pdf">("code");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [name, setName] = useState(projectName);
  const [seenChat, setSeenChat] = useState(0);

  const editorRef = useRef<CodeEditorHandle>(null);
  const pendingJump = useRef<{ line: number } | null>(null);
  const compilingRef = useRef(false);
  const queued = useRef(false);

  const activeFile = files.find((f) => f.id === activeFileId) ?? null;

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), error ? 6000 : 3000);
  }, []);

  /* ---------- open the main (or last) file once synced ---------- */
  useEffect(() => {
    if (!synced || !doc || activeFileId) return;
    const last = files.find((f) => f.id === lastFile && f.kind !== "folder");
    const main = resolveMainFile(doc);
    setActiveFileId(last?.id ?? main?.id ?? files.find((f) => f.kind === "text")?.id ?? null);
  }, [synced, doc, files, activeFileId, lastFile]);

  // Active file was deleted by someone else → fall back to the main file.
  useEffect(() => {
    if (activeFileId && synced && doc && !files.some((f) => f.id === activeFileId)) {
      setActiveFileId(resolveMainFile(doc)?.id ?? null);
    }
  }, [files, activeFileId, synced, doc]);

  useEffect(() => {
    collab?.provider.awareness?.setLocalStateField("fileId", activeFileId);
    if (activeFileId) setLastFile(activeFileId);
  }, [activeFileId, collab, setLastFile]);

  // Apply a pending "go to line" after the editor switched files.
  useEffect(() => {
    if (pendingJump.current && editorRef.current) {
      const { line } = pendingJump.current;
      pendingJump.current = null;
      requestAnimationFrame(() => editorRef.current?.gotoLine(line));
    }
  }, [activeFileId]);

  const openFile = useCallback(
    (id: string, line?: number) => {
      if (isMobile) setMobileView("code");
      if (line) {
        if (id === activeFileId) editorRef.current?.gotoLine(line);
        else pendingJump.current = { line };
      }
      setActiveFileId(id);
    },
    [activeFileId, isMobile],
  );

  /* ---------- compile ---------- */
  const compile = useCallback(
    async (clean = false) => {
      if (!collab) return;
      if (compilingRef.current) {
        queued.current = true;
        return;
      }
      compilingRef.current = true;
      setCompiling(true);
      setCompileError(null);
      try {
        // Make sure our latest keystrokes reached the server before compiling.
        for (let i = 0; i < 20 && collab.provider.hasUnsyncedChanges; i++) await new Promise((r) => setTimeout(r, 100));
        const res = await api.json<CompileResult>(`/projects/${projectId}/compile`, { clean });
        setResult(res);
        if (res.buildId) setPdfData(await api.arrayBuffer(`/projects/${projectId}/builds/${res.buildId}/output.pdf`));
        if (res.status === "failure") setLogsOpen(true);
      } catch (e) {
        setCompileError((e as Error).message);
      } finally {
        compilingRef.current = false;
        setCompiling(false);
        if (queued.current) {
          queued.current = false;
          setTimeout(() => compile(), 0);
        }
      }
    },
    [collab, projectId],
  );

  // First compile once the document is loaded.
  const compiledOnce = useRef(false);
  useEffect(() => {
    if (synced && !compiledOnce.current) {
      compiledOnce.current = true;
      compile();
    }
  }, [synced, compile]);

  // Auto-compile after local edits.
  useEffect(() => {
    if (!collab || !autoCompile || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (_u: Uint8Array, origin: unknown) => {
      if (origin === collab.provider) return; // remote change
      clearTimeout(timer);
      timer = setTimeout(() => compile(), 2500);
    };
    collab.doc.on("update", onUpdate);
    return () => {
      clearTimeout(timer);
      collab.doc.off("update", onUpdate);
    };
  }, [collab, autoCompile, readOnly, compile]);

  // Ctrl/Cmd+S anywhere on the page compiles instead of saving the HTML.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // already handled by the code editor
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "Enter")) {
        e.preventDefault();
        compile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compile]);

  /* ---------- SyncTeX ---------- */
  const syncToPdf = useCallback(async () => {
    const cur = editorRef.current?.getCursor();
    if (!cur || !activeFile || !result?.buildId) return;
    try {
      const { boxes } = await api.json<{ boxes: SynctexBox[] }>(`/projects/${projectId}/synctex/forward`, {
        buildId: result.buildId,
        file: activeFile.path,
        line: cur.line,
        column: cur.column,
      });
      if (boxes.length) {
        setHighlight({ boxes, nonce: Date.now() });
        if (isMobile) setMobileView("pdf");
      } else showToast("Não encontrei esse trecho no PDF. Recompile e tente de novo.");
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }, [activeFile, result, projectId, isMobile, showToast]);

  const syncToCode = useCallback(
    async (page: number, x: number, y: number) => {
      if (!result?.buildId) return;
      try {
        const { position } = await api.json<{ position: { file: string; line: number } | null }>(`/projects/${projectId}/synctex/inverse`, {
          buildId: result.buildId,
          page,
          x,
          y,
        });
        const f = position && files.find((x) => x.path === position.file);
        if (f && position) openFile(f.id, position.line);
      } catch (e) {
        showToast((e as Error).message, true);
      }
    },
    [result, projectId, files, openFile, showToast],
  );

  const jumpTo = (d: Diagnostic) => {
    const f = files.find((x) => x.path === d.file);
    if (f) openFile(f.id, d.line ?? 1);
  };

  /* ---------- files ---------- */
  const upload = useCallback(
    async (list: File[], parentId: string | null) => {
      for (const file of list) {
        showToast(`Enviando ${file.name}…`);
        try {
          const qs = new URLSearchParams({ name: file.name, ...(parentId ? { parentId } : {}) });
          await api.upload(`/projects/${projectId}/upload?${qs}`, file);
          showToast(`${file.name} enviado.`);
        } catch (e) {
          showToast(`${file.name}: ${(e as Error).message}`, true);
        }
      }
    },
    [projectId, showToast],
  );

  const downloadFile = useCallback(
    async (f: ResolvedFile) => {
      try {
        if (f.kind === "text") {
          const text = doc ? getContents(doc).get(f.id)?.toString() ?? "" : "";
          saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), f.name);
        } else if (f.assetId) {
          saveBlob(await api.blob(`/projects/${projectId}/assets/${f.assetId}`), f.name);
        }
      } catch (e) {
        showToast((e as Error).message, true);
      }
    },
    [doc, projectId, showToast],
  );

  const safeName = name.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").trim() || "projeto";

  const downloadPdf = async () => {
    if (!result?.buildId) return;
    try {
      saveBlob(await api.blob(`/projects/${projectId}/builds/${result.buildId}/output.pdf`), `${safeName}.pdf`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };

  const downloadZip = async () => {
    try {
      saveBlob(await api.blob(`/projects/${projectId}/download.zip`), `${safeName}.zip`);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };

  const activeDiagnostics = useMemo(
    () => (result && activeFile ? result.diagnostics.filter((d) => d.file === activeFile.path) : []),
    [result, activeFile],
  );
  const errorCount = result?.diagnostics.filter((d) => d.level === "error").length ?? 0;
  const warningCount = result?.diagnostics.filter((d) => d.level === "warning").length ?? 0;
  const unread = chatOpen ? 0 : chat.slice(seenChat).filter((m) => m.userId !== me.id).length;
  useEffect(() => {
    if (chatOpen) setSeenChat(chat.length);
  }, [chatOpen, chat.length]);

  /* ---------- render ---------- */

  if (status === "denied") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="text-red-500" />
        <h1 className="text-lg font-semibold">Sem acesso a este projeto</h1>
        <p className="max-w-sm text-sm text-zinc-600">Seu acesso pode ter sido removido. Peça um novo convite ao dono do projeto.</p>
        <Link href="/projects" className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
          Voltar aos projetos
        </Link>
      </div>
    );
  }

  const header = (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2 sm:px-3">
      <Link href="/projects" className="flex items-center gap-2 rounded-lg p-1 hover:bg-zinc-100" title="Voltar aos projetos">
        <ArrowLeft size={16} className="text-zinc-500" />
        <Logo size={24} />
      </Link>
      {!isMobile && (
        <button className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setSidebarOpen((s) => !s)} title="Mostrar/ocultar arquivos">
          <PanelLeft size={16} />
        </button>
      )}
      <input
        value={name}
        readOnly={readOnly}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={async () => {
          if (name.trim() && name !== projectName) {
            const res = await renameProject(projectId, name);
            if (!res.ok) (showToast(res.error, true), setName(projectName));
            else router.refresh();
          } else setName(projectName);
        }}
        className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold outline-none hover:bg-zinc-100 focus:bg-zinc-100 sm:max-w-xs sm:flex-none"
        aria-label="Nome do projeto"
      />
      {status !== "connected" && (
        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700" title="As alterações serão sincronizadas quando a conexão voltar">
          <WifiOff size={12} /> {status === "connecting" ? "Conectando…" : "Offline"}
        </span>
      )}
      {readOnly && (
        <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
          <Eye size={12} /> Somente leitura
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <div className="mr-1 hidden -space-x-1.5 sm:flex">
          {presence.slice(0, 5).map((p) => (
            <button
              key={p.id}
              onClick={() => p.fileId && files.some((f) => f.id === p.fileId) && openFile(p.fileId)}
              title={`${p.name}${p.fileId ? ` — em ${files.find((f) => f.id === p.fileId)?.name ?? "…"}` : ""}`}
              className="rounded-full transition hover:z-10 hover:-translate-y-0.5"
            >
              <Avatar name={p.name} image={p.image} color={p.color} size={28} ring />
            </button>
          ))}
          {presence.length > 5 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-600 ring-2 ring-white">
              +{presence.length - 5}
            </span>
          )}
        </div>

        <Button size="icon" variant="ghost" className="relative" onClick={() => setChatOpen((o) => !o)} title="Chat" aria-label="Chat">
          <MessageSquare size={16} />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread}</span>}
        </Button>

        <div className="hidden items-center gap-1.5 sm:flex">
        <Menu
          align="right"
          className="w-64"
          trigger={({ onClick }) => (
            <Button size="icon" variant="ghost" onClick={onClick} title="Configurações do projeto" aria-label="Configurações">
              <Settings2 size={16} />
            </Button>
          )}
        >
          {() => (
            <div className="grid gap-3 p-2">
              <label className="grid gap-1 text-xs font-medium text-zinc-600">
                Compilador
                <select
                  disabled={readOnly || !doc}
                  value={settings.compiler}
                  onChange={(e) => doc && getSettingsMap(doc).set("compiler", e.target.value)}
                  className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                >
                  {COMPILERS.map((c) => (
                    <option key={c} value={c}>
                      {COMPILER_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-zinc-600">
                Arquivo principal
                <select
                  disabled={readOnly || !doc}
                  value={(doc && resolveMainFile(doc)?.id) ?? ""}
                  onChange={(e) => doc && getSettingsMap(doc).set("mainFileId", e.target.value)}
                  className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900"
                >
                  {files
                    .filter((f) => f.kind === "text" && f.name.endsWith(".tex"))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-zinc-700">
                Compilar automaticamente
                <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} className="h-4 w-4 accent-zinc-900" />
              </label>
              <p className="text-[11px] leading-relaxed text-zinc-400">
                Atalhos: <kbd>Ctrl+S</kbd> compila · <kbd>Ctrl+Alt+→</kbd> mostra no PDF · dois cliques no PDF vão ao código.
              </p>
            </div>
          )}
        </Menu>

        <Menu
          align="right"
          trigger={({ onClick }) => (
            <Button size="icon" variant="ghost" onClick={onClick} title="Baixar" aria-label="Baixar">
              <Download size={16} />
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<FileDown size={14} />}
                disabled={!result?.buildId}
                onClick={() => (close(), downloadPdf())}
              >
                Baixar PDF
              </MenuItem>
              <MenuItem
                icon={<FileArchive size={14} />}
                onClick={() => (close(), downloadZip())}
              >
                Baixar código-fonte (.zip)
              </MenuItem>
            </>
          )}
        </Menu>
        </div>

        {isMobile ? (
          <Menu
            align="right"
            trigger={({ onClick }) => (
              <Button size="icon" variant="ghost" onClick={onClick} aria-label="Mais opções">
                <MoreVertical size={16} />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Share2 size={14} />} onClick={() => (close(), setShareOpen(true))}>
                  Compartilhar
                </MenuItem>
                <MenuItem icon={<RefreshCw size={14} />} onClick={() => (close(), compile(true))}>
                  Recompilar do zero
                </MenuItem>
                <MenuItem icon={<FileDown size={14} />} disabled={!result?.buildId} onClick={() => (close(), downloadPdf())}>
                  Baixar PDF
                </MenuItem>
                <MenuItem icon={<FileArchive size={14} />} onClick={() => (close(), downloadZip())}>
                  Baixar código-fonte (.zip)
                </MenuItem>
              </>
            )}
          </Menu>
        ) : (
          <Button size="sm" onClick={() => setShareOpen(true)}>
            <Share2 size={14} /> Compartilhar
          </Button>
        )}

        <div className="flex">
          <Button variant="primary" size="sm" className={cn(!isMobile && "rounded-r-none")} onClick={() => compile()} disabled={!synced} title="Compilar (Ctrl+S)">
            {compiling ? <Spinner size={13} /> : <Play size={13} className="fill-current" />}
            <span className="hidden sm:inline">{compiling ? "Compilando" : "Compilar"}</span>
          </Button>
          {!isMobile && (
          <Menu
            align="right"
            trigger={({ onClick }) => (
              <Button variant="primary" size="sm" className="rounded-l-none border-l border-zinc-700 px-1.5" onClick={onClick} aria-label="Opções de compilação">
                <ChevronDown size={14} />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<RefreshCw size={14} />} onClick={() => (close(), compile(true))}>
                  Recompilar do zero
                </MenuItem>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100">
                  Compilar automaticamente
                  <input type="checkbox" checked={autoCompile} onChange={(e) => setAutoCompile(e.target.checked)} className="accent-zinc-900" />
                </label>
              </>
            )}
          </Menu>
          )}
        </div>
      </div>
    </header>
  );

  const fileTree = collab ? (
    <FileTree
      collab={collab}
      files={files}
      activeFileId={activeFileId}
      mainFileId={doc ? resolveMainFile(doc)?.id ?? null : null}
      readOnly={readOnly}
      presence={presence}
      onOpen={(id) => openFile(id)}
      onUpload={upload}
      onDownload={downloadFile}
    />
  ) : null;

  const editorPane = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 px-3 text-[13px]">
        <span className="min-w-0 truncate text-zinc-500">
          {activeFile?.path.split("/").map((seg, i, arr) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-zinc-300">/</span>}
              <span className={i === arr.length - 1 ? "font-medium text-zinc-900" : ""}>{seg}</span>
            </span>
          ))}
        </span>
        {activeFile?.kind === "text" && result?.buildId && (
          <button
            onClick={syncToPdf}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            title="Mostrar a posição do cursor no PDF (Ctrl+Alt+→)"
          >
            <ArrowRightToLine size={13} /> Ver no PDF
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {!synced || !collab ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
            <Spinner /> Carregando projeto…
          </div>
        ) : !activeFile ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-400">Selecione um arquivo na lateral.</div>
        ) : activeFile.kind === "text" ? (
          <CodeEditor
            ref={editorRef}
            collab={collab}
            fileId={activeFile.id}
            fileName={activeFile.name}
            readOnly={readOnly}
            diagnostics={activeDiagnostics}
            onCompile={() => compile()}
            onSyncToPdf={syncToPdf}
          />
        ) : (
          <BinaryPreview projectId={projectId} file={activeFile} onDownload={() => downloadFile(activeFile)} />
        )}
      </div>
    </div>
  );

  const pdfHeader = (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3 text-[13px]">
      {compiling ? (
        <span className="flex items-center gap-2 text-zinc-500">
          <Spinner size={12} /> Compilando…
        </span>
      ) : compileError ? (
        <span className="flex min-w-0 items-center gap-1.5 text-red-600" title={compileError}>
          <AlertCircle size={14} className="shrink-0" /> <span className="truncate">{compileError}</span>
        </span>
      ) : result ? (
        <span className={cn("flex items-center gap-1.5", result.status === "success" ? "text-zinc-500" : "text-red-600")}>
          {result.status === "success" ? "Compilado" : result.status === "error" ? "Compilado com erros" : "Falha na compilação"}
          <span className="text-zinc-400">· {(result.durationMs / 1000).toFixed(1)}s</span>
        </span>
      ) : (
        <span className="text-zinc-400">PDF</span>
      )}
      {result && (
        <button
          onClick={() => setLogsOpen((o) => !o)}
          className={cn("ml-auto flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-zinc-100", logsOpen && "bg-zinc-100")}
          title="Erros e log"
        >
          <span className={cn("flex items-center gap-1", errorCount ? "text-red-600" : "text-zinc-400")}>
            <AlertCircle size={13} /> {errorCount}
          </span>
          <span className={cn("flex items-center gap-1", warningCount ? "text-amber-600" : "text-zinc-400")}>
            <TriangleAlert size={13} /> {warningCount}
          </span>
          <span className="text-zinc-600">Logs</span>
        </button>
      )}
    </div>
  );

  const pdfBody = (
    <div className="relative h-full min-h-0 bg-zinc-100">
      {pdfData ? (
        <PdfViewer data={pdfData} highlight={highlight} onInverseSearch={syncToCode} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-zinc-400">
          {compiling || !synced ? (
            <>
              <Spinner size={18} /> Gerando PDF…
            </>
          ) : (
            <>Clique em Compilar para gerar o PDF.</>
          )}
        </div>
      )}
      {compiling && pdfData && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-500" />}
    </div>
  );

  const pdfPane = (
    <div className="flex h-full min-h-0 flex-col">
      {pdfHeader}
      <div className="min-h-0 flex-1">
        {logsOpen && result ? (
          <Group orientation="vertical">
            <Panel id="pdf" minSize="20%">
              {pdfBody}
            </Panel>
            <Separator className="h-px" />
            <Panel id="logs" defaultSize="45%" minSize="15%">
              <LogPanel result={result} onJump={jumpTo} onClose={() => setLogsOpen(false)} />
            </Panel>
          </Group>
        ) : (
          pdfBody
        )}
      </div>
    </div>
  );

  const chatPane = collab && <ChatPanel collab={collab} me={me} messages={chat} onClose={() => setChatOpen(false)} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {header}
      {isMobile ? (
        <>
          <div className="relative min-h-0 flex-1">
            <div className={cn("absolute inset-0", mobileView !== "files" && "invisible")}>{fileTree}</div>
            <div className={cn("absolute inset-0", mobileView !== "code" && "invisible")}>{editorPane}</div>
            <div className={cn("absolute inset-0", mobileView !== "pdf" && "invisible")}>{pdfPane}</div>
            {chatOpen && <div className="absolute inset-0 z-20">{chatPane}</div>}
          </div>
          <nav className="grid shrink-0 grid-cols-3 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]">
            {([
              ["files", "Arquivos", FolderTree],
              ["code", "Código", Code2],
              ["pdf", "PDF", FileDown],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => (setMobileView(k), setChatOpen(false))}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", mobileView === k ? "text-zinc-900" : "text-zinc-400")}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <Group orientation="horizontal" className="min-h-0 flex-1">
          {sidebarOpen && (
            <>
              <Panel id="sidebar" defaultSize="17%" minSize={180} maxSize="35%">
                {chatOpen ? (
                  <Group orientation="vertical">
                    <Panel id="tree" minSize="20%">
                      {fileTree}
                    </Panel>
                    <Separator className="h-px" />
                    <Panel id="chat" defaultSize="50%" minSize="20%">
                      {chatPane}
                    </Panel>
                  </Group>
                ) : (
                  fileTree
                )}
              </Panel>
              <Separator className="w-px" />
            </>
          )}
          {!sidebarOpen && chatOpen && (
            <>
              <Panel id="chat-only" defaultSize="20%" minSize={220}>
                {chatPane}
              </Panel>
              <Separator className="w-px" />
            </>
          )}
          <Panel id="editor" minSize="20%">
            {editorPane}
          </Panel>
          <Separator className="w-px" />
          <Panel id="pdf-pane" defaultSize="42%" minSize="15%">
            {pdfPane}
          </Panel>
        </Group>
      )}

      <ShareDialog projectId={projectId} projectName={name} meId={me.id} open={shareOpen} onClose={() => setShareOpen(false)} />

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg",
            toast.error ? "bg-red-600" : "bg-zinc-900",
            isMobile && "bottom-20",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function BinaryPreview({ projectId, file, onDownload }: { projectId: string; file: ResolvedFile; onDownload: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isImage = /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(file.mime ?? "");
  const isPdf = file.mime === "application/pdf";

  useEffect(() => {
    if (!file.assetId || (!isImage && !isPdf)) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setPdf(null);
    setError(null);
    (async () => {
      try {
        if (isPdf) {
          const data = await api.arrayBuffer(`/projects/${projectId}/assets/${file.assetId}`);
          if (!cancelled) setPdf(data);
        } else {
          const blob = await api.blob(`/projects/${projectId}/assets/${file.assetId}`);
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, file.assetId, isImage, isPdf]);

  if (isPdf && pdf) return <PdfViewer data={pdf} highlight={null} />;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:20px_20px] p-6">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : isImage ? (
        url ? <img src={url} alt={file.name} className="max-h-[70%] max-w-full rounded shadow-lg" /> : <Spinner size={18} />
      ) : (
        <p className="text-sm text-zinc-500">Pré-visualização indisponível para este tipo de arquivo.</p>
      )}
      <div className="rounded-lg bg-white/90 px-3 py-2 text-center text-xs text-zinc-500 shadow-sm">
        {file.name} · {((file.size ?? 0) / 1024).toFixed(0)} KB ·{" "}
        <button onClick={onDownload} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
          Baixar
        </button>
        <div className="mt-1 text-zinc-400">
          Use no LaTeX com <code className="text-zinc-600">\includegraphics{"{"}{file.path}{"}"}</code>
        </div>
      </div>
    </div>
  );
}
