import { SignJWT } from "jose";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const TTL_SECONDS = 2 * 60 * 60;

/** Short-lived token the browser uses to talk to the realtime/compile server. */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const secret = process.env.REALTIME_SECRET;
  if (!secret) return Response.json({ error: "REALTIME_SECRET não configurado" }, { status: 500 });
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = await new SignJWT({ name: session.user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setAudience("texcollab-realtime")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return Response.json({ token, expiresAt: expiresAt * 1000 }, { headers: { "Cache-Control": "no-store" } });
}
