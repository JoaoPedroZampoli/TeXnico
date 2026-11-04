"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  colorForUser,
  getChat,
  getFiles,
  getSettingsMap,
  listFiles,
  readSettings,
  type ChatMessage,
  type ProjectSettings,
  type ResolvedFile,
} from "@texcollab/shared";
import { REALTIME_WS_URL } from "@/lib/config";
import { getRealtimeToken } from "./realtime";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "denied";

export interface Collab {
  doc: Y.Doc;
  provider: HocuspocusProvider;
}

export interface Me {
  id: string;
  name: string;
  image: string | null;
}

export function useCollab(projectId: string, me: Me) {
  const [collab, setCollab] = useState<Collab | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: REALTIME_WS_URL,
      name: projectId,
      document: doc,
      token: getRealtimeToken,
      onStatus: ({ status }) => setStatus(status as ConnectionStatus),
      onSynced: ({ state }) => state && setSynced(true),
      onAuthenticationFailed: () => setStatus("denied"),
    });
    const { color, colorLight } = colorForUser(me.id);
    provider.awareness?.setLocalStateField("user", { id: me.id, name: me.name, image: me.image, color, colorLight });
    setCollab({ doc, provider });
    return () => {
      provider.destroy();
      doc.destroy();
      setCollab(null);
      setSynced(false);
    };
  }, [projectId, me.id, me.name, me.image]);

  return { collab, status, synced };
}

/** Subscribes to a Yjs type and recomputes a derived value on every change. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useYValue<T>(type: Y.AbstractType<any> | null, compute: () => T, deep = false): T {
  const [value, setValue] = useState<T>(compute);
  useEffect(() => {
    if (!type) return;
    const update = () => setValue(compute());
    update();
    if (deep) {
      type.observeDeep(update);
      return () => type.unobserveDeep(update);
    }
    type.observe(update);
    return () => type.unobserve(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  return value;
}

export const useFiles = (doc: Y.Doc | null): ResolvedFile[] =>
  useYValue(doc ? getFiles(doc) : null, () => (doc ? listFiles(doc) : []));

export const useSettings = (doc: Y.Doc | null): ProjectSettings =>
  useYValue(doc ? getSettingsMap(doc) : null, () => (doc ? readSettings(doc) : { mainFileId: null, compiler: "pdflatex" }));

export const useChat = (doc: Y.Doc | null): ChatMessage[] =>
  useYValue(doc ? getChat(doc) : null, () => (doc ? getChat(doc).toArray() : []));

export interface PresenceUser {
  clientId: number;
  id: string;
  name: string;
  image: string | null;
  color: string;
  fileId: string | null;
}

/** Other people currently connected (one entry per user, most recent tab wins). */
export function usePresence(provider: HocuspocusProvider | null, meId: string): PresenceUser[] {
  const awareness = provider?.awareness ?? null;
  const subscribe = (cb: () => void) => {
    awareness?.on("change", cb);
    return () => awareness?.off("change", cb);
  };
  const snapshotKey = () => {
    if (!awareness) return "[]";
    const list: PresenceUser[] = [];
    const seen = new Set<string>();
    awareness.getStates().forEach((s, clientId) => {
      const u = s.user;
      if (!u || clientId === awareness.clientID || u.id === meId || seen.has(u.id)) return;
      seen.add(u.id);
      list.push({ clientId, id: u.id, name: u.name, image: u.image ?? null, color: u.color, fileId: s.fileId ?? null });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(list);
  };
  const key = useSyncExternalStore(subscribe, snapshotKey, () => "[]");
  return useMemo(() => JSON.parse(key), [key]);
}
