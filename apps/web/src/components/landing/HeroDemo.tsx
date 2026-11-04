"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText, Play, BookMarked, Folder } from "lucide-react";

/**
 * Animated mock of the editor: two friends type in the same document,
 * then the document is compiled and the PDF updates.
 */

const ANA = "Pela relação de de Broglie, $\\lambda = h/p$.";
const BRUNO = " = \\frac{hc}{\\lambda}";

const PEOPLE = {
  ana: { name: "Ana", color: "#7c3aed" },
  bruno: { name: "Bruno", color: "#ea580c" },
};

type Phase = "ana" | "bruno" | "compiling" | "done";

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\\[a-zA-Z]+|\$[^$]*\$?|[{}])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const t = m[0];
    const cls = t.startsWith("\\") ? "text-violet-700" : t.startsWith("$") ? "text-emerald-700" : "text-zinc-400";
    out.push(
      <span key={k++} className={cls}>
        {t}
      </span>,
    );
    last = m.index + t.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function Cursor({ who, blink = true }: { who: keyof typeof PEOPLE; blink?: boolean }) {
  const p = PEOPLE[who];
  return (
    <span className="relative inline-block h-[1.15em] w-0 align-text-bottom">
      <span className={`absolute inset-y-0 left-0 w-[2px] ${blink ? "caret-blink" : ""}`} style={{ background: p.color }} />
      <span
        className="absolute -top-[1.35em] left-0 rounded-[4px] rounded-bl-none px-1.5 py-px font-sans text-[10px] leading-tight font-semibold whitespace-nowrap text-white"
        style={{ background: p.color }}
      >
        {p.name}
      </span>
    </span>
  );
}

export function HeroDemo() {
  const [phase, setPhase] = useState<Phase>("ana");
  const [ana, setAna] = useState(0);
  const [bruno, setBruno] = useState(0);
  const [compiled, setCompiled] = useState(0); // 0 = initial PDF, 1 = updated PDF

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAna(ANA.length);
      setBruno(BRUNO.length);
      setCompiled(1);
      setPhase("done");
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    if (phase === "ana") {
      t = ana < ANA.length ? setTimeout(() => setAna((n) => n + 1), 45 + Math.random() * 60) : setTimeout(() => setPhase("bruno"), 500);
    } else if (phase === "bruno") {
      t = bruno < BRUNO.length ? setTimeout(() => setBruno((n) => n + 1), 70 + Math.random() * 70) : setTimeout(() => setPhase("compiling"), 700);
    } else if (phase === "compiling") {
      t = setTimeout(() => {
        setCompiled(1);
        setPhase("done");
      }, 1100);
    } else {
      t = setTimeout(() => {
        setAna(0);
        setBruno(0);
        setCompiled(0);
        setPhase("ana");
      }, 4500);
    }
    return () => clearTimeout(t);
  }, [phase, ana, bruno]);

  const lines: { text: string; cursor?: { who: keyof typeof PEOPLE; at: number } }[] = [
    { text: "\\section{Resultados}" },
    { text: "A energia de um fóton é dada por" },
    { text: "\\begin{equation}" },
    { text: "  E = h\\nu" + BRUNO.slice(0, bruno), cursor: phase === "bruno" || bruno > 0 ? { who: "bruno", at: 10 + bruno } : undefined },
    { text: "\\end{equation}" },
    { text: ANA.slice(0, ana), cursor: { who: "ana", at: ana } },
    { text: "" },
    { text: "\\subsection{Discussão}" },
    { text: "Como visto em~\\cite{einstein1905}, …" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_40px_100px_-30px_rgb(24_24_27/0.35)] ring-1 ring-black/[0.02]">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="truncate text-xs font-medium text-zinc-500">TCC — Física Moderna</span>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex -space-x-1.5">
            {(["ana", "bruno"] as const).map((w) => (
              <span
                key={w}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white"
                style={{ background: PEOPLE[w].color }}
              >
                {PEOPLE[w].name[0]}
              </span>
            ))}
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-white ring-2 ring-white">
              V
            </span>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-white transition-colors ${
              phase === "compiling" ? "bg-brand-600" : "bg-zinc-900"
            }`}
          >
            {phase === "compiling" ? (
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white border-t-transparent" />
            ) : (
              <Play size={10} className="fill-current" />
            )}
            {phase === "compiling" ? "Compilando" : "Compilar"}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-[170px_1fr_1fr]">
        {/* file tree */}
        <div className="hidden border-r border-zinc-100 bg-zinc-50/60 p-2 text-[12px] text-zinc-600 md:block">
          <div className="px-2 pt-1 pb-2 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">Arquivos</div>
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
            <Folder size={13} className="text-zinc-400" /> capitulos
          </div>
          <div className="flex items-center gap-1.5 rounded-md py-1 pr-2 pl-6">
            <FileText size={13} className="text-zinc-400" /> introducao.tex
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-zinc-900 py-1 pr-2 pl-6 text-white">
            <FileText size={13} /> resultados.tex
            <span className="ml-auto flex -space-x-0.5">
              <span className="h-1.5 w-1.5 rounded-full ring-1 ring-zinc-900" style={{ background: PEOPLE.ana.color }} />
              <span className="h-1.5 w-1.5 rounded-full ring-1 ring-zinc-900" style={{ background: PEOPLE.bruno.color }} />
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
            <FileText size={13} className="text-zinc-400" /> main.tex
          </div>
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
            <BookMarked size={13} className="text-zinc-400" /> referencias.bib
          </div>
        </div>

        {/* code */}
        <div className="min-h-[300px] overflow-hidden border-zinc-100 py-4 font-mono text-[12px] leading-[1.9] md:border-r">
          {lines.map((l, i) => (
            <div key={i} className="flex">
              <span className="w-9 shrink-0 pr-3 text-right text-zinc-300 select-none">{i + 1}</span>
              <span className="min-w-0 pr-3 whitespace-pre text-zinc-800">
                {l.cursor ? (
                  <>
                    {highlight(l.text.slice(0, l.cursor.at))}
                    <Cursor who={l.cursor.who} blink={phase !== l.cursor.who} />
                    {highlight(l.text.slice(l.cursor.at))}
                  </>
                ) : (
                  highlight(l.text) || " "
                )}
              </span>
            </div>
          ))}
        </div>

        {/* pdf */}
        <div className="hidden bg-zinc-100 p-5 md:block">
          <div className="relative mx-auto min-h-[260px] max-w-[300px] bg-white px-7 py-6 font-paper text-[12.5px] leading-relaxed text-zinc-900 shadow-sm">
            {phase === "compiling" && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-brand-500" />}
            <div className="text-[16px] font-semibold">
              <span className="mr-2">2</span>Resultados
            </div>
            <p className="mt-2">A energia de um fóton é dada por</p>
            <div key={`eq-${compiled}`} className={`my-3 flex items-center justify-center italic ${compiled ? "pdf-in" : ""}`}>
              <span>
                E = hν
                {compiled === 1 && (
                  <>
                    {" "}={" "}
                    <span className="inline-flex flex-col items-center align-middle text-[12px] leading-none not-italic">
                      <span className="border-b border-zinc-900 px-0.5 pb-0.5 italic">hc</span>
                      <span className="pt-0.5 italic">λ</span>
                    </span>
                  </>
                )}
              </span>
              <span className="ml-auto not-italic">(2.1)</span>
            </div>
            {compiled === 1 && (
              <p className="pdf-in">
                Pela relação de de Broglie, <i>λ</i> = <i>h</i>/<i>p</i>.
              </p>
            )}
            <div className="mt-4 text-[14px] font-semibold">
              <span className="mr-2">2.1</span>Discussão
            </div>
            <p className="mt-1.5">Como visto em [1], …</p>
          </div>
        </div>
      </div>
    </div>
  );
}
