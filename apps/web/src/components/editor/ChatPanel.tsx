"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { colorForUser, getChat, newId, type ChatMessage } from "@texcollab/shared";
import { Avatar } from "../ui";
import type { Collab, Me } from "./hooks";

const MAX_MESSAGES = 500;

export function ChatPanel({ collab, me, messages, onClose }: { collab: Collab; me: Me; messages: ChatMessage[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const chat = getChat(collab.doc);
    collab.doc.transact(() => {
      chat.push([{ id: newId(), userId: me.id, name: me.name, color: colorForUser(me.id).color, text: t.slice(0, 4000), at: Date.now() }]);
      if (chat.length > MAX_MESSAGES) chat.delete(0, chat.length - MAX_MESSAGES);
    });
    setText("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 pr-1.5 pl-3">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Chat do projeto</span>
        <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Fechar chat">
          <X size={15} />
        </button>
      </div>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && <p className="pt-8 text-center text-sm text-zinc-400">Nenhuma mensagem ainda. Diga oi! 👋</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.userId === m.userId && m.at - prev.at < 5 * 60_000;
          const mine = m.userId === me.id;
          return (
            <div key={m.id} className={`flex gap-2 ${grouped ? "-mt-2" : ""}`}>
              <div className="w-7 shrink-0">{!grouped && <Avatar name={m.name} color={m.color} size={26} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: m.color }}>
                      {mine ? "Você" : m.name}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                )}
                <p className="text-[13px] break-words whitespace-pre-wrap text-zinc-700">{m.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-zinc-200 p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          rows={1}
          placeholder="Mensagem…"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:border-zinc-400"
        />
        <button type="submit" className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300" disabled={!text.trim()} aria-label="Enviar">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
