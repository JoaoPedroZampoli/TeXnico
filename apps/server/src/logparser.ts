export type DiagnosticLevel = "error" | "warning" | "typesetting";

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  /** Project-relative path ("chapters/intro.tex") or null when unknown / outside the project. */
  file: string | null;
  line: number | null;
  /** Extra context lines from the log. */
  content?: string;
}

const normalize = (p: string) => p.replace(/^\.\//, "").replace(/^"|"$/g, "");

/**
 * Parses a TeX log produced with `-file-line-error` and `max_print_line` set very high
 * (so lines are not wrapped at 79 chars).
 */
export function parseLatexLog(log: string, workdir: string): Diagnostic[] {
  const lines = log.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const fileStack: string[] = [];
  const toProjectPath = (p: string | undefined | null) => {
    if (!p) return null;
    let n = normalize(p);
    if (n.startsWith(workdir + "/")) n = n.slice(workdir.length + 1);
    if (n.startsWith("/")) return null; // system file (package, class…)
    return n;
  };
  const currentFile = () => {
    for (let i = fileStack.length - 1; i >= 0; i--) {
      const p = toProjectPath(fileStack[i]);
      if (p) return p;
    }
    return null;
  };

  const seen = new Set<string>();
  const push = (d: Diagnostic) => {
    const key = `${d.level}|${d.file}|${d.line}|${d.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(d);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // -file-line-error style: ./main.tex:12: Undefined control sequence.
    const fle = /^((?:\.{0,2}\/)?[^:\s][^:]*\.[A-Za-z0-9]+):(\d+): (.*)$/.exec(line);
    if (fle) {
      const ctx: string[] = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        if (lines[j].trim() === "" && ctx.length) break;
        ctx.push(lines[j]);
        if (/^l\.\d+/.test(lines[j])) {
          if (lines[j + 1] !== undefined) ctx.push(lines[j + 1]);
          break;
        }
      }
      push({
        level: "error",
        file: toProjectPath(fle[1]),
        line: Number(fle[2]),
        message: fle[3].replace(/^LaTeX Error: /, ""),
        content: ctx.join("\n").trim() || undefined,
      });
      continue;
    }

    // Classic "! Message" errors (e.g. "! Emergency stop.")
    if (line.startsWith("! ")) {
      let lineNo: number | null = null;
      const ctx: string[] = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
        ctx.push(lines[j]);
        const m = /^l\.(\d+)/.exec(lines[j]);
        if (m) {
          lineNo = Number(m[1]);
          break;
        }
      }
      const msg = line.slice(2);
      // "Emergency stop" right after a real error is noise.
      if (/^(Emergency stop|==> Fatal error occurred)/.test(msg) && diagnostics.some((d) => d.level === "error")) continue;
      push({ level: "error", file: currentFile(), line: lineNo, message: msg, content: ctx.join("\n").trim() || undefined });
      continue;
    }

    // LaTeX / Package / Class warnings (possibly continued on following lines)
    const warn = /^(?:LaTeX|Package ([\w.-]+)|Class ([\w.-]+)|LaTeX Font) Warning: (.*)$/.exec(line);
    if (warn) {
      const pkg = warn[1] ?? warn[2];
      let msg = warn[3];
      for (let j = i + 1; j < lines.length; j++) {
        const cont = lines[j];
        if (pkg && cont.startsWith(`(${pkg})`)) msg += " " + cont.slice(pkg.length + 2).trim();
        else if (!pkg && /^\s{2,}\S/.test(cont) && !/Warning:/.test(cont)) msg += " " + cont.trim();
        else break;
        i = j;
      }
      const at = /on input line (\d+)\.?/.exec(msg);
      push({
        level: "warning",
        file: currentFile(),
        line: at ? Number(at[1]) : null,
        message: (pkg ? `[${pkg}] ` : "") + msg.replace(/\s+/g, " ").trim(),
      });
      continue;
    }

    // Overfull / Underfull boxes
    const box = /^((?:Over|Under)full \\[hv]box .*?)(?: (?:in paragraph|in alignment|detected) at lines? (\d+)(?:--\d+)?)?$/.exec(line);
    if (box) {
      push({ level: "typesetting", file: currentFile(), line: box[2] ? Number(box[2]) : null, message: box[1] });
      continue;
    }

    // Track "(./file.tex" and ")" to know which file we are in.
    const re = /\((\.{0,2}\/[^\s()"]+|"[^"]+"|[\w\-/.]+\.(?:tex|sty|cls|cfg|clo|def|fd|bbl|aux|toc|ltx|lco|bbx|cbx))|\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m[0] === ")") fileStack.pop();
      else fileStack.push(m[1]);
    }
  }

  // Errors first, then warnings, then typesetting.
  const order: Record<DiagnosticLevel, number> = { error: 0, warning: 1, typesetting: 2 };
  return diagnostics.sort((a, b) => order[a.level] - order[b.level]);
}

/** BibTeX/Biber messages from their own log files. */
export function parseBibLog(log: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of log.split(/\r?\n/)) {
    const bibtexWarn = /^Warning--(.*)$/.exec(line);
    if (bibtexWarn) out.push({ level: "warning", file: null, line: null, message: `[BibTeX] ${bibtexWarn[1]}` });
    const bibtexErr = /^(.*)---line (\d+) of file (.*)$/.exec(line);
    if (bibtexErr) out.push({ level: "error", file: normalize(bibtexErr[3]), line: Number(bibtexErr[2]), message: `[BibTeX] ${bibtexErr[1]}` });
    const biber = /^\[\d+\] .*?> (WARN|ERROR) - (.*)$/.exec(line);
    if (biber) out.push({ level: biber[1] === "ERROR" ? "error" : "warning", file: null, line: null, message: `[Biber] ${biber[2]}` });
  }
  return out;
}
