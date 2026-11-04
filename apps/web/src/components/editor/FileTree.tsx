"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  ChevronRight,
  Download,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Upload,
  BookMarked,
} from "lucide-react";
import {
  createFolder,
  createTextFile,
  deleteEntry,
  descendantIds,
  findChild,
  getSettingsMap,
  updateEntry,
  validateFileName,
  type ResolvedFile,
} from "@texcollab/shared";
import { cn, Menu, MenuItem, useConfirm } from "../ui";
import type { Collab, PresenceUser } from "./hooks";

const DRAG_TYPE = "application/x-texcollab-file";

function iconFor(f: ResolvedFile, open: boolean) {
  if (f.kind === "folder") return open ? <FolderOpen size={15} /> : <Folder size={15} />;
  const ext = f.name.split(".").pop()?.toLowerCase();
  if (f.kind === "binary" && /^(png|jpe?g|gif|webp|svg|eps|pdf)$/.test(ext ?? "")) return <ImageIcon size={15} />;
  if (ext === "bib") return <BookMarked size={15} />;
  if (ext === "tex") return <FileText size={15} />;
  return <File size={15} />;
}

interface Props {
  collab: Collab;
  files: ResolvedFile[];
  activeFileId: string | null;
  mainFileId: string | null;
  readOnly: boolean;
  presence: PresenceUser[];
  onOpen: (id: string) => void;
  onUpload: (files: File[], parentId: string | null) => void;
  onDownload: (file: ResolvedFile) => void;
}

type Draft = { mode: "create"; parentId: string | null; kind: "text" | "folder" } | { mode: "rename"; id: string };

export function FileTree({ collab, files, activeFileId, mainFileId, readOnly, presence, onOpen, onUpload, onDownload }: Props) {
  const { doc } = collab;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadParent = useRef<string | null>(null);
  const cancelled = useRef(false);
  const { confirm, dialog } = useConfirm();

  const children = useMemo(() => {
    const map = new Map<string | null, ResolvedFile[]>();
    for (const f of files) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) || a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
    return map;
  }, [files]);

  const presenceByFile = useMemo(() => {
    const m = new Map<string, PresenceUser[]>();
    for (const p of presence) if (p.fileId) m.set(p.fileId, [...(m.get(p.fileId) ?? []), p]);
    return m;
  }, [presence]);

  function commit(name: string) {
    if (!draft) return;
    const n = name.trim();
    if (!n) return setDraft(null);
    const err = validateFileName(n);
    if (err) return setError(err);
    if (draft.mode === "create") {
      if (findChild(doc, draft.parentId, n)) return setError("Já existe um item com esse nome aqui.");
      if (draft.kind === "folder") createFolder(doc, draft.parentId, n);
      else onOpen(createTextFile(doc, draft.parentId, n.includes(".") ? n : `${n}.tex`).id);
      if (draft.parentId) setCollapsed((c) => (c.delete(draft.parentId!), new Set(c)));
    } else {
      const cur = files.find((f) => f.id === draft.id);
      if (!cur || cur.name === n) return setDraft(null);
      const clash = findChild(doc, cur.parentId, n);
      if (clash && clash.id !== cur.id) return setError("Já existe um item com esse nome aqui.");
      updateEntry(doc, draft.id, { name: n });
    }
    setError(null);
    setDraft(null);
  }

  async function remove(f: ResolvedFile) {
    const count = descendantIds(doc, f.id).length - 1;
    const ok = await confirm({
      title: f.kind === "folder" ? "Excluir pasta" : "Excluir arquivo",
      body: (
        <>
          Excluir <b>{f.path}</b>
          {count > 0 && ` e ${count} ${count === 1 ? "item" : "itens"} dentro dela`}? Isso afeta todos os colaboradores.
        </>
      ),
      danger: true,
      confirmLabel: "Excluir",
    });
    if (ok) deleteEntry(doc, f.id);
  }

  function move(id: string, parentId: string | null) {
    if (readOnly) return;
    const f = files.find((x) => x.id === id);
    if (!f || f.parentId === parentId) return;
    if (parentId && descendantIds(doc, id).includes(parentId)) return;
    if (findChild(doc, parentId, f.name)) {
      setError(`Já existe "${f.name}" no destino.`);
      return;
    }
    updateEntry(doc, id, { parentId });
  }

  const dragHandlers = (target: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (readOnly) return;
      if (!e.dataTransfer.types.includes(DRAG_TYPE) && !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(target ?? "root");
    },
    onDragLeave: (e: DragEvent) => {
      e.stopPropagation();
      setDropTarget((t) => (t === (target ?? "root") ? null : t));
    },
    onDrop: (e: DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id) move(id, target);
      else if (e.dataTransfer.files.length) onUpload([...e.dataTransfer.files], target);
    },
  });

  function startUpload(parentId: string | null) {
    uploadParent.current = parentId;
    uploadInput.current?.click();
  }

  function renderDraftInput(depth: number, initial = "", kind: "text" | "folder" = "text") {
    return (
      <div className="flex items-center gap-1.5 py-0.5 pr-2" style={{ paddingLeft: 8 + depth * 14 + 16 }}>
        <span className="text-zinc-400">{kind === "folder" ? <Folder size={15} /> : <FileText size={15} />}</span>
        <input
          autoFocus
          defaultValue={initial}
          placeholder={kind === "folder" ? "nome-da-pasta" : "arquivo.tex"}
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              cancelled.current = true;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            if (cancelled.current) {
              cancelled.current = false;
              setDraft(null);
              setError(null);
            } else commit(e.currentTarget.value);
          }}
          className="h-6 min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1.5 text-[13px] outline-none focus:border-zinc-500"
        />
      </div>
    );
  }

  function renderLevel(parentId: string | null, depth: number): React.ReactNode {
    const list = children.get(parentId) ?? [];
    return (
      <>
        {draft?.mode === "create" && draft.parentId === parentId && renderDraftInput(depth, "", draft.kind)}
        {list.map((f) => {
          const isOpen = f.kind === "folder" && !collapsed.has(f.id);
          const here = presenceByFile.get(f.id) ?? [];
          if (draft?.mode === "rename" && draft.id === f.id) return <div key={f.id}>{renderDraftInput(depth, f.name, f.kind === "folder" ? "folder" : "text")}</div>;
          return (
            <div key={f.id}>
              <div
                draggable={!readOnly}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, f.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                {...(f.kind === "folder" ? dragHandlers(f.id) : {})}
                onClick={() => {
                  if (f.kind === "folder")
                    setCollapsed((c) => {
                      const n = new Set(c);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    });
                  else onOpen(f.id);
                }}
                className={cn(
                  "group flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-[13px] select-none",
                  f.id === activeFileId ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-200/60",
                  dropTarget === f.id && "ring-2 ring-brand-500 ring-inset",
                )}
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                <ChevronRight
                  size={12}
                  className={cn("shrink-0 transition-transform", f.kind !== "folder" && "invisible", isOpen && "rotate-90")}
                />
                <span className={cn("shrink-0", f.id === activeFileId ? "text-white" : "text-zinc-400")}>{iconFor(f, isOpen)}</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.id === mainFileId && (
                  <Star size={12} className={cn("shrink-0", f.id === activeFileId ? "fill-white text-white" : "fill-amber-400 text-amber-400")} aria-label="Arquivo principal" />
                )}
                {here.length > 0 && (
                  <span className="flex shrink-0 -space-x-1">
                    {here.slice(0, 3).map((p) => (
                      <span key={p.id} title={`${p.name} está aqui`} className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: p.color }} />
                    ))}
                  </span>
                )}
                <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <Menu
                    align="right"
                    trigger={({ onClick, open }) => (
                      <button
                        onClick={onClick}
                        className={cn(
                          "rounded p-0.5 opacity-0 group-hover:opacity-100",
                          open && "opacity-100",
                          f.id === activeFileId ? "hover:bg-white/20" : "hover:bg-zinc-300/60",
                        )}
                        aria-label="Ações do arquivo"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {f.kind === "folder" && !readOnly && (
                          <>
                            <MenuItem icon={<FilePlus size={14} />} onClick={() => (close(), setDraft({ mode: "create", parentId: f.id, kind: "text" }))}>
                              Novo arquivo
                            </MenuItem>
                            <MenuItem icon={<FolderPlus size={14} />} onClick={() => (close(), setDraft({ mode: "create", parentId: f.id, kind: "folder" }))}>
                              Nova pasta
                            </MenuItem>
                            <MenuItem icon={<Upload size={14} />} onClick={() => (close(), startUpload(f.id))}>
                              Enviar arquivos
                            </MenuItem>
                          </>
                        )}
                        {f.kind === "text" && f.name.endsWith(".tex") && !readOnly && f.id !== mainFileId && (
                          <MenuItem icon={<Star size={14} />} onClick={() => (close(), getSettingsMap(doc).set("mainFileId", f.id))}>
                            Definir como principal
                          </MenuItem>
                        )}
                        {f.kind !== "folder" && (
                          <MenuItem icon={<Download size={14} />} onClick={() => (close(), onDownload(f))}>
                            Baixar
                          </MenuItem>
                        )}
                        {!readOnly && (
                          <>
                            <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setDraft({ mode: "rename", id: f.id }))}>
                              Renomear
                            </MenuItem>
                            <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), remove(f))}>
                              Excluir
                            </MenuItem>
                          </>
                        )}
                      </>
                    )}
                  </Menu>
                </span>
              </div>
              {isOpen && renderLevel(f.id, depth + 1)}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-50">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 pr-1.5 pl-3">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Arquivos</span>
        {!readOnly && (
          <div className="flex items-center text-zinc-500">
            <button className="rounded-md p-1.5 hover:bg-zinc-200/70 hover:text-zinc-900" title="Novo arquivo" onClick={() => setDraft({ mode: "create", parentId: null, kind: "text" })}>
              <FilePlus size={15} />
            </button>
            <button className="rounded-md p-1.5 hover:bg-zinc-200/70 hover:text-zinc-900" title="Nova pasta" onClick={() => setDraft({ mode: "create", parentId: null, kind: "folder" })}>
              <FolderPlus size={15} />
            </button>
            <button className="rounded-md p-1.5 hover:bg-zinc-200/70 hover:text-zinc-900" title="Enviar arquivos (imagens, .bib, .tex…)" onClick={() => startUpload(null)}>
              <Upload size={15} />
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mx-2 mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <div
        className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5", dropTarget === "root" && "bg-brand-50 ring-2 ring-brand-500 ring-inset")}
        {...dragHandlers(null)}
      >
        {renderLevel(null, 0)}
        {!readOnly && <p className="px-2 pt-4 pb-2 text-[11px] leading-relaxed text-zinc-400">Arraste arquivos do computador para cá para enviá-los.</p>}
      </div>
      <input
        ref={uploadInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onUpload([...e.target.files], uploadParent.current);
          e.target.value = "";
        }}
      />
      {dialog}
    </div>
  );
}
