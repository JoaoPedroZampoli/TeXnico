"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  and,
  eq,
  getDb,
  inviteLink,
  project,
  projectMember,
  user,
  type Role,
} from "@texcollab/db";
import { createProjectDoc, TEMPLATES, type TemplateId } from "@texcollab/shared";
import { requireUser } from "./session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const id = () => randomUUID().replace(/-/g, "").slice(0, 20);

async function roleOf(projectId: string, userId: string): Promise<Role | null> {
  const rows = await getDb()
    .select({ role: projectMember.role })
    .from(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 120);

export async function createProject(input: { name: string; template: TemplateId }): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "Dê um nome ao projeto." };
  const template = TEMPLATES.some((t) => t.id === input.template) ? input.template : "blank";
  const projectId = id();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(project).values({ id: projectId, name, ownerId: me.id, ydoc: createProjectDoc(template, name) });
    await tx.insert(projectMember).values({ projectId, userId: me.id, role: "owner", lastOpenedAt: new Date() });
  });
  revalidatePath("/projects");
  return { ok: true, id: projectId };
}

export async function renameProject(projectId: string, rawName: string): Promise<Result> {
  const me = await requireUser();
  const role = await roleOf(projectId, me.id);
  if (role !== "owner" && role !== "editor") return { ok: false, error: "Sem permissão." };
  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "O nome não pode ficar vazio." };
  await getDb().update(project).set({ name }).where(eq(project.id, projectId));
  revalidatePath("/projects");
  revalidatePath(`/project/${projectId}`);
  return { ok: true };
}

export async function deleteProject(projectId: string): Promise<Result> {
  const me = await requireUser();
  if ((await roleOf(projectId, me.id)) !== "owner") return { ok: false, error: "Apenas o dono pode excluir o projeto." };
  await getDb().delete(project).where(eq(project.id, projectId));
  revalidatePath("/projects");
  return { ok: true };
}

export async function leaveProject(projectId: string): Promise<Result> {
  const me = await requireUser();
  const role = await roleOf(projectId, me.id);
  if (!role) return { ok: false, error: "Você não participa deste projeto." };
  if (role === "owner") return { ok: false, error: "O dono não pode sair do projeto; exclua-o ou transfira a posse." };
  await getDb()
    .delete(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, me.id)));
  revalidatePath("/projects");
  return { ok: true };
}

/* ---------------- sharing ---------------- */

export interface ShareInfo {
  myRole: Role;
  members: { userId: string; name: string; email: string; image: string | null; role: Role }[];
  links: { id: string; token: string; role: "editor" | "viewer" }[];
}

export async function getShareInfo(projectId: string): Promise<Result<{ info: ShareInfo }>> {
  const me = await requireUser();
  const myRole = await roleOf(projectId, me.id);
  if (!myRole) return { ok: false, error: "Sem acesso." };
  const db = getDb();
  const members = await db
    .select({ userId: user.id, name: user.name, email: user.email, image: user.image, role: projectMember.role })
    .from(projectMember)
    .innerJoin(user, eq(user.id, projectMember.userId))
    .where(eq(projectMember.projectId, projectId));
  const order: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };
  members.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  const links =
    myRole === "viewer"
      ? []
      : await db
          .select({ id: inviteLink.id, token: inviteLink.token, role: inviteLink.role })
          .from(inviteLink)
          .where(eq(inviteLink.projectId, projectId));
  return { ok: true, info: { myRole, members, links } };
}

async function requireManager(projectId: string) {
  const me = await requireUser();
  const role = await roleOf(projectId, me.id);
  if (role !== "owner" && role !== "editor") throw new Error("Sem permissão para compartilhar este projeto.");
  return { me, role };
}

export async function inviteByEmail(projectId: string, email: string, role: "editor" | "viewer"): Promise<Result<{ name: string }>> {
  try {
    await requireManager(projectId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const normalized = email.trim().toLowerCase();
  const [target] = await getDb().select({ id: user.id, name: user.name }).from(user).where(eq(user.email, normalized)).limit(1);
  if (!target) {
    return {
      ok: false,
      error: "Ninguém com esse e-mail tem conta ainda. Envie um link de convite — a pessoa cria a conta e entra direto no projeto.",
    };
  }
  const existing = await roleOf(projectId, target.id);
  if (existing === "owner") return { ok: false, error: "Essa pessoa é a dona do projeto." };
  await getDb()
    .insert(projectMember)
    .values({ projectId, userId: target.id, role: role === "viewer" ? "viewer" : "editor" })
    .onConflictDoUpdate({ target: [projectMember.projectId, projectMember.userId], set: { role } });
  return { ok: true, name: target.name };
}

export async function createInviteLink(projectId: string, role: "editor" | "viewer"): Promise<Result<{ token: string }>> {
  let me;
  try {
    ({ me } = await requireManager(projectId));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const token = randomBytes(18).toString("base64url");
  await getDb()
    .insert(inviteLink)
    .values({ id: id(), token, projectId, role: role === "viewer" ? "viewer" : "editor", createdById: me.id });
  return { ok: true, token };
}

export async function revokeInviteLink(projectId: string, linkId: string): Promise<Result> {
  try {
    await requireManager(projectId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await getDb().delete(inviteLink).where(and(eq(inviteLink.id, linkId), eq(inviteLink.projectId, projectId)));
  return { ok: true };
}

export async function setMemberRole(projectId: string, userId: string, role: "editor" | "viewer"): Promise<Result> {
  const me = await requireUser();
  if ((await roleOf(projectId, me.id)) !== "owner") return { ok: false, error: "Apenas o dono pode alterar permissões." };
  if (userId === me.id) return { ok: false, error: "Você não pode alterar sua própria permissão." };
  await getDb()
    .update(projectMember)
    .set({ role: role === "viewer" ? "viewer" : "editor" })
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
  return { ok: true };
}

export async function removeMember(projectId: string, userId: string): Promise<Result> {
  const me = await requireUser();
  if ((await roleOf(projectId, me.id)) !== "owner") return { ok: false, error: "Apenas o dono pode remover pessoas." };
  if (userId === me.id) return { ok: false, error: "O dono não pode ser removido." };
  await getDb()
    .delete(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
  return { ok: true };
}

export async function transferOwnership(projectId: string, userId: string): Promise<Result> {
  const me = await requireUser();
  if ((await roleOf(projectId, me.id)) !== "owner") return { ok: false, error: "Apenas o dono pode transferir o projeto." };
  if ((await roleOf(projectId, userId)) === null) return { ok: false, error: "Essa pessoa não participa do projeto." };
  await getDb().transaction(async (tx) => {
    await tx.update(project).set({ ownerId: userId }).where(eq(project.id, projectId));
    await tx
      .update(projectMember)
      .set({ role: "owner" })
      .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)));
    await tx
      .update(projectMember)
      .set({ role: "editor" })
      .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, me.id)));
  });
  revalidatePath("/projects");
  return { ok: true };
}

/** Joins the current user to a project through an invite link. Returns the project id. */
export async function acceptInvite(token: string): Promise<Result<{ projectId: string }>> {
  const me = await requireUser(`/invite/${token}`);
  const [link] = await getDb().select().from(inviteLink).where(eq(inviteLink.token, token)).limit(1);
  if (!link) return { ok: false, error: "Este convite não existe ou foi revogado." };
  const current = await roleOf(link.projectId, me.id);
  if (!current) {
    await getDb().insert(projectMember).values({ projectId: link.projectId, userId: me.id, role: link.role });
  } else if (current === "viewer" && link.role === "editor") {
    await getDb()
      .update(projectMember)
      .set({ role: "editor" })
      .where(and(eq(projectMember.projectId, link.projectId), eq(projectMember.userId, me.id)));
  }
  return { ok: true, projectId: link.projectId };
}
