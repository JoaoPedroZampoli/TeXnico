import { jwtVerify } from "jose";
import { and, eq, getDb, projectMember, type Role } from "@texcollab/db";
import { env } from "./env";

export interface TokenUser {
  userId: string;
  name: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Verifies a short-lived token minted by the web app (/api/realtime-token). */
export async function verifyToken(token: string | undefined | null): Promise<TokenUser> {
  if (!token) throw new HttpError(401, "Token ausente");
  try {
    const { payload } = await jwtVerify(token, env.realtimeSecret, { audience: "texcollab-realtime" });
    if (typeof payload.sub !== "string") throw new Error("sub");
    return { userId: payload.sub, name: String(payload.name ?? "") };
  } catch {
    throw new HttpError(401, "Token inválido ou expirado");
  }
}

export async function getRole(projectId: string, userId: string): Promise<Role | null> {
  const rows = await getDb()
    .select({ role: projectMember.role })
    .from(projectMember)
    .where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function requireRole(projectId: string, userId: string, write: boolean): Promise<Role> {
  const role = await getRole(projectId, userId);
  if (!role) throw new HttpError(403, "Você não tem acesso a este projeto");
  if (write && role === "viewer") throw new HttpError(403, "Você tem acesso somente para leitura");
  return role;
}
