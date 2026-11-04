"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Crown, Link2, Trash2 } from "lucide-react";
import { colorForUser } from "@texcollab/shared";
import {
  createInviteLink,
  getShareInfo,
  inviteByEmail,
  removeMember,
  revokeInviteLink,
  setMemberRole,
  transferOwnership,
  type ShareInfo,
} from "@/lib/actions";
import { Avatar, Button, Input, Modal, Spinner, useConfirm } from "../ui";

const ROLE = { owner: "Dono", editor: "Pode editar", viewer: "Pode ver" } as const;

export function ShareDialog({ projectId, projectName, meId, open, onClose }: { projectId: string; projectName: string; meId: string; open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await getShareInfo(projectId);
    if (res.ok) setInfo(res.info);
    else setMessage({ ok: false, text: res.error });
  }, [projectId]);

  useEffect(() => {
    if (open) {
      setMessage(null);
      load();
    }
  }, [open, load]);

  const canManage = info?.myRole === "owner" || info?.myRole === "editor";
  const isOwner = info?.myRole === "owner";
  const linkUrl = (token: string) => `${window.location.origin}/invite/${token}`;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await inviteByEmail(projectId, email, role);
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: `${res.name} agora tem acesso ao projeto.` } : { ok: false, text: res.error });
    if (res.ok) {
      setEmail("");
      load();
    }
  }

  async function newLink(r: "editor" | "viewer") {
    const res = await createInviteLink(projectId, r);
    if (!res.ok) return setMessage({ ok: false, text: res.error });
    await load();
    copy(res.token);
  }

  function copy(token: string) {
    navigator.clipboard
      ?.writeText(linkUrl(token))
      .then(() => {
        setCopied(token);
        setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
      })
      .catch(() => setMessage({ ok: false, text: "Não foi possível copiar automaticamente — selecione o link e copie manualmente." }));
  }

  async function act(p: Promise<{ ok: boolean; error?: string }>) {
    const res = await p;
    if (!res.ok) setMessage({ ok: false, text: res.error ?? "Erro" });
    load();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Compartilhar “${projectName}”`} width="max-w-xl">
      {!info ? (
        <div className="flex justify-center py-10 text-zinc-400">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="grid gap-6">
          {canManage && (
            <form onSubmit={invite} className="grid gap-2">
              <label className="text-sm font-medium">Convidar por e-mail</label>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <Input type="email" required placeholder="amigo@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                >
                  <option value="editor">Pode editar</option>
                  <option value="viewer">Pode ver</option>
                </select>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy && <Spinner />} Convidar
                </Button>
              </div>
              <p className="text-xs text-zinc-500">A pessoa precisa já ter uma conta. Se ainda não tiver, envie um link de convite.</p>
            </form>
          )}

          {message && (
            <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
          )}

          {canManage && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Links de convite</span>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => newLink("editor")}>
                    <Link2 size={14} /> Link para editar
                  </Button>
                  <Button size="sm" onClick={() => newLink("viewer")}>
                    <Link2 size={14} /> Link para ver
                  </Button>
                </div>
              </div>
              {info.links.length === 0 ? (
                <p className="text-xs text-zinc-500">Qualquer pessoa com um link pode entrar no projeto depois de fazer login. Você pode revogar a qualquer momento.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {info.links.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 py-1.5 pr-1.5 pl-3">
                      <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">{ROLE[l.role]}</span>
                      <code className="min-w-0 flex-1 truncate text-xs text-zinc-500 select-all">{linkUrl(l.token)}</code>
                      <Button size="sm" variant="ghost" onClick={() => copy(l.token)}>
                        {copied === l.token ? <Check size={14} className="text-brand-600" /> : <Copy size={14} />}
                        {copied === l.token ? "Copiado" : "Copiar"}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => act(revokeInviteLink(projectId, l.id))} title="Revogar link" aria-label="Revogar link">
                        <Trash2 size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <span className="text-sm font-medium">Pessoas com acesso ({info.members.length})</span>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {info.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={m.name} image={m.image} color={colorForUser(m.userId).color} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name} {m.userId === meId && <span className="font-normal text-zinc-400">(você)</span>}
                    </div>
                    <div className="truncate text-xs text-zinc-500">{m.email}</div>
                  </div>
                  {m.role === "owner" ? (
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Crown size={13} className="text-amber-500" /> Dono
                    </span>
                  ) : isOwner ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={m.role}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "owner") {
                            confirm({
                              title: "Transferir posse",
                              body: <>{m.name} passará a ser dono do projeto e você se tornará editor.</>,
                              confirmLabel: "Transferir",
                            }).then((ok) => {
                              if (ok) act(transferOwnership(projectId, m.userId));
                            });
                          } else act(setMemberRole(projectId, m.userId, v as "editor" | "viewer"));
                        }}
                        className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs"
                      >
                        <option value="editor">Pode editar</option>
                        <option value="viewer">Pode ver</option>
                        <option value="owner">Tornar dono</option>
                      </select>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Remover"
                        aria-label={`Remover ${m.name}`}
                        onClick={async () => {
                          if (await confirm({ title: "Remover pessoa", body: <>Remover o acesso de {m.name}?</>, danger: true, confirmLabel: "Remover" }))
                            act(removeMember(projectId, m.userId));
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">{ROLE[m.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {dialog}
    </Modal>
  );
}
