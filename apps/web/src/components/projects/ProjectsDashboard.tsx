"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FileText, LogOut, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { TEMPLATES, type TemplateId } from "@texcollab/shared";
import { createProject, deleteProject, leaveProject, renameProject } from "@/lib/actions";
import { APP_NAME } from "@/lib/config";
import { Button, cn, Input, Logo, Menu, MenuItem, Modal, Spinner, useConfirm } from "../ui";
import { UserMenu } from "../UserMenu";

interface ProjectRow {
  id: string;
  name: string;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
  ownerName: string;
  lastOpenedAt: string | null;
}

const ROLE_LABEL = { owner: "Dono", editor: "Editor", viewer: "Leitor" };

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ProjectsDashboard({
  user,
  projects,
}: {
  user: { id: string; name: string; email: string; image: string | null };
  projects: ProjectRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "mine" | "shared">("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProjectRow | null>(null);
  const { confirm, dialog } = useConfirm();
  const [, startTransition] = useTransition();

  const visible = useMemo(
    () =>
      projects
        .filter((p) => (filter === "mine" ? p.role === "owner" : filter === "shared" ? p.role !== "owner" : true))
        .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, filter, query],
  );

  async function onDelete(p: ProjectRow) {
    const ok = await confirm({
      title: "Excluir projeto",
      body: (
        <>
          O projeto <b>{p.name}</b> será excluído para todos os participantes. Essa ação não pode ser desfeita.
        </>
      ),
      danger: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const res = await deleteProject(p.id);
    if (!res.ok) alert(res.error);
    startTransition(() => router.refresh());
  }

  async function onLeave(p: ProjectRow) {
    const ok = await confirm({ title: "Sair do projeto", body: <>Você perderá o acesso a <b>{p.name}</b>.</>, confirmLabel: "Sair" });
    if (!ok) return;
    const res = await leaveProject(p.id);
    if (!res.ok) alert(res.error);
    startTransition(() => router.refresh());
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/projects" className="flex items-center gap-2.5 font-semibold">
            <Logo /> {APP_NAME}
          </Link>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Seus projetos</h1>
            <p className="mt-1 text-sm text-zinc-500">Olá, {user.name.split(" ")[0]}! Crie um projeto ou abra um compartilhado com você.</p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Novo projeto
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
            {([
              ["all", "Todos"],
              ["mine", "Meus"],
              ["shared", "Compartilhados comigo"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn("rounded-md px-3 py-1.5", filter === k ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar projetos" className="pl-9" />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <FileText className="mx-auto text-zinc-300" size={36} />
            <p className="mt-3 font-medium">{projects.length ? "Nenhum projeto encontrado" : "Nenhum projeto ainda"}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {projects.length ? "Tente outro filtro ou termo de busca." : "Crie seu primeiro projeto a partir de um modelo."}
            </p>
            {!projects.length && (
              <Button variant="primary" className="mt-5" onClick={() => setCreating(true)}>
                <Plus size={16} /> Novo projeto
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="hidden grid-cols-[1fr_160px_160px_44px] gap-4 border-b border-zinc-100 px-5 py-2.5 text-xs font-medium tracking-wide text-zinc-500 uppercase sm:grid">
              <span>Nome</span>
              <span>Dono</span>
              <span>Modificado</span>
              <span />
            </div>
            <ul className="divide-y divide-zinc-100">
              {visible.map((p) => (
                <li key={p.id} className="group grid grid-cols-[1fr_44px] items-center gap-4 px-5 py-3 hover:bg-zinc-50 sm:grid-cols-[1fr_160px_160px_44px]">
                  <Link href={`/project/${p.id}`} className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500">
                      {p.role === "owner" ? <FileText size={16} /> : <Users size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium group-hover:underline">{p.name}</span>
                      <span className="block text-xs text-zinc-500 sm:hidden" suppressHydrationWarning>
                        {ROLE_LABEL[p.role]} · {timeAgo(p.updatedAt)}
                      </span>
                      {p.role !== "owner" && (
                        <span className="hidden text-xs text-zinc-500 sm:block">Você é {ROLE_LABEL[p.role].toLowerCase()}</span>
                      )}
                    </span>
                  </Link>
                  <span className="hidden truncate text-sm text-zinc-600 sm:block">{p.role === "owner" ? "Você" : p.ownerName}</span>
                  <span className="hidden text-sm text-zinc-500 sm:block" suppressHydrationWarning>
                    {timeAgo(p.updatedAt)}
                  </span>
                  <Menu
                    align="right"
                    trigger={({ onClick }) => (
                      <Button variant="ghost" size="icon" onClick={onClick} aria-label="Ações">
                        <MoreHorizontal size={16} />
                      </Button>
                    )}
                  >
                    {(close) => (
                      <>
                        {p.role !== "viewer" && (
                          <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setRenaming(p))}>
                            Renomear
                          </MenuItem>
                        )}
                        {p.role === "owner" ? (
                          <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), onDelete(p))}>
                            Excluir
                          </MenuItem>
                        ) : (
                          <MenuItem danger icon={<LogOut size={14} />} onClick={() => (close(), onLeave(p))}>
                            Sair do projeto
                          </MenuItem>
                        )}
                      </>
                    )}
                  </Menu>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
      <RenameDialog project={renaming} onClose={() => setRenaming(null)} />
      {dialog}
    </div>
  );
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("article");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await createProject({ name, template });
    if (!res.ok) {
      setError(res.error);
      setPending(false);
      return;
    }
    router.push(`/project/${res.id}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo projeto" width="max-w-lg">
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Nome
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: TCC, Lista de Cálculo 3…" required />
        </label>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Modelo</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  template === t.id ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <div className="text-sm font-medium">{t.name}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending && <Spinner />} Criar projeto
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ project, onClose }: { project: ProjectRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  if (project && project.id !== last) {
    setLast(project.id);
    setName(project.name);
    setError(null);
  }
  return (
    <Modal open={!!project} onClose={onClose} title="Renomear projeto">
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await renameProject(project!.id, name);
          if (!res.ok) return setError(res.error);
          onClose();
          router.refresh();
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary">
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
