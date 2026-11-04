export type DiagnosticLevel = "error" | "warning" | "typesetting";

export interface Diagnostic {
  level: DiagnosticLevel;
  message: string;
  file: string | null;
  line: number | null;
  content?: string;
}

export interface CompileResult {
  status: "success" | "error" | "failure";
  buildId: string | null;
  diagnostics: Diagnostic[];
  log: string;
  output: string;
  durationMs: number;
  timedOut: boolean;
  mainPath: string | null;
}

export interface SynctexBox {
  page: number;
  h: number;
  v: number;
  width: number;
  height: number;
}
