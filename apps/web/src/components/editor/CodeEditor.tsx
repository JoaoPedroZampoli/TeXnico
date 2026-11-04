"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as Y from "yjs";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  Decoration,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { setDiagnostics, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { StateEffect, StateField } from "@codemirror/state";
import { latex } from "codemirror-lang-latex";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { getContents } from "@texcollab/shared";
import type { Collab } from "./hooks";
import type { Diagnostic } from "./types";

export interface CodeEditorHandle {
  gotoLine(line: number, column?: number): void;
  getCursor(): { line: number; column: number } | null;
  focus(): void;
}

const PHRASES = EditorState.phrases.of({
  Find: "Buscar",
  Replace: "Substituir",
  next: "próximo",
  previous: "anterior",
  all: "todos",
  "match case": "diferenciar maiúsculas",
  "by word": "palavra inteira",
  regexp: "regex",
  replace: "substituir",
  "replace all": "substituir todos",
  close: "fechar",
  "Go to line": "Ir para a linha",
  go: "ir",
});

/* Flash highlight for "go to line" / SyncTeX jumps. */
const flashEffect = StateEffect.define<number | null>();
const flashField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashEffect)) {
        deco = e.value === null ? Decoration.none : Decoration.set([Decoration.line({ class: "cm-flash-line" }).range(e.value)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  "&": { backgroundColor: "#fff" },
  ".cm-content": { padding: "12px 0 40vh" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 14px", minWidth: "40px" },
  ".cm-tooltip": { borderRadius: "8px", border: "1px solid #e4e4e7", boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "#18181b" },
  ".cm-panels": { borderColor: "#e4e4e7" },
});

const LATEX_EXT = /\.(tex|sty|cls|ltx|dtx|tikz|def|bbx|cbx)$/i;

interface Props {
  collab: Collab;
  fileId: string;
  fileName: string;
  readOnly: boolean;
  diagnostics: Diagnostic[];
  onCompile: () => void;
  onSyncToPdf: () => void;
}

export const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor(
  { collab, fileId, fileName, readOnly, diagnostics, onCompile, onSyncToPdf },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const undoManagers = useRef(new Map<string, Y.UndoManager>());
  const viewState = useRef(new Map<string, { anchor: number; head: number; scroll: number }>());
  const callbacks = useRef({ onCompile, onSyncToPdf });
  callbacks.current = { onCompile, onSyncToPdf };

  useEffect(() => {
    const v = new EditorView({ parent: host.current! });
    view.current = v;
    const managers = undoManagers.current;
    return () => {
      v.destroy();
      view.current = null;
      managers.forEach((m) => m.destroy());
      managers.clear();
    };
  }, [collab]);

  // (Re)build the editor state whenever the file or permissions change.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const ytext = getContents(collab.doc).get(fileId);
    if (!ytext) return;

    let undo = undoManagers.current.get(fileId);
    if (!undo) {
      undo = new Y.UndoManager(ytext);
      undoManagers.current.set(fileId, undo);
    }

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      lintGutter(),
      EditorView.lineWrapping,
      PHRASES,
      theme,
      flashField,
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onCompile(), true) },
        { key: "Mod-Enter", preventDefault: true, run: () => (callbacks.current.onCompile(), true) },
        { key: "Mod-Alt-ArrowRight", preventDefault: true, run: () => (callbacks.current.onSyncToPdf(), true) },
        ...yUndoManagerKeymap,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      LATEX_EXT.test(fileName)
        ? latex({ enableLinting: false, autoCloseTags: true, enableTooltips: true, enableAutocomplete: true, autoCloseBrackets: true })
        : [],
      yCollab(ytext, collab.provider.awareness, { undoManager: undo }),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
    ];

    const saved = viewState.current.get(fileId);
    const content = ytext.toString();
    const clamp = (n: number) => Math.min(Math.max(0, n), content.length);
    v.setState(
      EditorState.create({
        doc: content,
        extensions,
        selection: saved ? EditorSelection.single(clamp(saved.anchor), clamp(saved.head)) : undefined,
      }),
    );
    if (saved) requestAnimationFrame(() => (v.scrollDOM.scrollTop = saved.scroll));
    else v.scrollDOM.scrollTop = 0;

    return () => {
      const sel = v.state.selection.main;
      viewState.current.set(fileId, { anchor: sel.anchor, head: sel.head, scroll: v.scrollDOM.scrollTop });
    };
  }, [collab, fileId, fileName, readOnly]);

  // Compile diagnostics for this file → squiggles + gutter markers.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const cm: CmDiagnostic[] = diagnostics
      .filter((d) => d.line && d.line <= doc.lines)
      .map((d) => {
        const line = doc.line(d.line!);
        return {
          from: line.from,
          to: line.to,
          severity: d.level === "error" ? "error" : d.level === "warning" ? "warning" : "info",
          message: d.message,
        };
      });
    v.dispatch(setDiagnostics(v.state, cm));
  }, [diagnostics, fileId, collab]);

  useImperativeHandle(ref, () => ({
    gotoLine(lineNo, column = 0) {
      const v = view.current;
      if (!v) return;
      const line = v.state.doc.line(Math.min(Math.max(1, lineNo), v.state.doc.lines));
      const pos = Math.min(line.from + Math.max(0, column), line.to);
      v.dispatch({
        selection: { anchor: pos },
        effects: [EditorView.scrollIntoView(pos, { y: "center" }), flashEffect.of(line.from)],
      });
      v.focus();
      setTimeout(() => view.current === v && v.dispatch({ effects: flashEffect.of(null) }), 1700);
    },
    getCursor() {
      const v = view.current;
      if (!v) return null;
      const head = v.state.selection.main.head;
      const line = v.state.doc.lineAt(head);
      return { line: line.number, column: head - line.from };
    },
    focus: () => view.current?.focus(),
  }));

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
});
