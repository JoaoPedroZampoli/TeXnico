"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../ui";
import type { CompileResult, Diagnostic } from "./types";

const ICON = {
  error: <AlertCircle size={15} className="text-red-500" />,
  warning: <AlertTriangle size={15} className="text-amber-500" />,
  typesetting: <Info size={15} className="text-sky-500" />,
};

export function LogPanel({
  result,
  onJump,
  onClose,
}: {
  result: CompileResult;
  onJump: (d: Diagnostic) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"problems" | "log">("problems");
  const [showBoxes, setShowBoxes] = useState(false);
  const list = result.diagnostics.filter((d) => showBoxes || d.level !== "typesetting");
  const counts = {
    error: result.diagnostics.filter((d) => d.level === "error").length,
    warning: result.diagnostics.filter((d) => d.level === "warning").length,
    typesetting: result.diagnostics.filter((d) => d.level === "typesetting").length,
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-200 px-2">
        {(["problems", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-md px-2.5 py-1 text-[13px]", tab === t ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-500 hover:text-zinc-900")}
          >
            {t === "problems" ? `Problemas (${counts.error + counts.warning})` : "Log completo"}
          </button>
        ))}
        <span className="ml-auto text-xs text-zinc-400">{(result.durationMs / 1000).toFixed(1)}s</span>
        <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Fechar logs">
          <X size={15} />
        </button>
      </div>
      {tab === "problems" ? (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
          {list.length === 0 && (
            <p className="p-6 text-center text-sm text-zinc-500">
              {result.status === "success" ? "Nenhum problema. Tudo certo! 🎉" : "Nenhum problema identificado — veja o log completo."}
            </p>
          )}
          {list.map((d, i) => (
            <button
              key={i}
              onClick={() => onJump(d)}
              disabled={!d.file}
              className={cn(
                "mb-1.5 block w-full rounded-lg border p-2.5 text-left transition",
                d.level === "error" ? "border-red-100 bg-red-50/50 hover:bg-red-50" : d.level === "warning" ? "border-amber-100 bg-amber-50/40 hover:bg-amber-50" : "border-zinc-100 hover:bg-zinc-50",
                !d.file && "cursor-default",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{ICON[d.level]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium break-words text-zinc-800">{d.message}</div>
                  {d.file && (
                    <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                      {d.file}
                      {d.line ? `:${d.line}` : ""}
                    </div>
                  )}
                  {d.content && <pre className="mt-1.5 overflow-x-auto rounded bg-white/70 p-1.5 font-mono text-[11px] whitespace-pre-wrap text-zinc-600">{d.content}</pre>}
                </div>
              </div>
            </button>
          ))}
          {counts.typesetting > 0 && (
            <label className="mt-2 flex items-center gap-2 px-1 text-xs text-zinc-500">
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
              Mostrar {counts.typesetting} avisos de diagramação (overfull/underfull)
            </label>
          )}
        </div>
      ) : (
        <pre className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700">
          {result.log || result.output || "(log vazio)"}
        </pre>
      )}
    </div>
  );
}
