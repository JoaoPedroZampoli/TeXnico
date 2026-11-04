"use client";

import { REALTIME_URL } from "@/lib/config";

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

/** Returns a valid token for the realtime server, refreshing it shortly before it expires. */
export function getRealtimeToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return Promise.resolve(cached.token);
  inflight ??= fetch("/api/realtime-token", { cache: "no-store" })
    .then(async (r) => {
      if (r.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        throw new Error("Sessão expirada");
      }
      if (!r.ok) throw new Error("Não foi possível obter o token");
      cached = await r.json();
      return cached!.token;
    })
    .finally(() => (inflight = null));
  return inflight;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getRealtimeToken();
  let res: Response;
  try {
    res = await fetch(`${REALTIME_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(0, "Servidor de compilação indisponível. Ele pode estar iniciando — tente de novo em alguns segundos.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Erro ${res.status}`);
  }
  return res;
}

export const api = {
  json: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request(path, body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })).json(),
  arrayBuffer: async (path: string) => (await request(path)).arrayBuffer(),
  blob: async (path: string) => (await request(path)).blob(),
  upload: async (path: string, file: Blob): Promise<{ fileId: string }> =>
    (await request(path, { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } })).json(),
};

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
