"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { SynctexBox } from "./types";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

/** pdf.js v6 destroys documents through their loading task. */
const loadingTasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();
const destroyDoc = (doc: PDFDocumentProxy) => void loadingTasks.get(doc)?.destroy();

const GAP = 14;
const PAD = 16;

interface Props {
  data: ArrayBuffer | null;
  highlight: { boxes: SynctexBox[]; nonce: number } | null;
  onInverseSearch?: (page: number, x: number, y: number) => void;
}

export function PdfViewer({ data, highlight, onInverseSearch }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef<(HTMLDivElement | null)[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [visible, setVisible] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const scale = zoom === "fit" ? fitScale : zoom;

  // Load a new PDF, keeping the old one on screen until the new one is ready.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
        const doc = await task.promise;
        loadingTasks.set(doc, task);
        const s = await Promise.all(
          Array.from({ length: doc.numPages }, async (_, i) => {
            const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
            return { w: vp.width, h: vp.height };
          }),
        );
        if (cancelled) return destroyDoc(doc);
        setError(null);
        setSizes(s);
        setPdf((prev) => {
          if (prev) setTimeout(() => destroyDoc(prev), 2000);
          return doc;
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Fit-to-width scale follows the panel width.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !sizes.length) return;
    const maxW = Math.max(...sizes.map((s) => s.w));
    const update = () => setFitScale(Math.max(0.25, (el.clientWidth - PAD * 2) / maxW));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sizes]);

  // Track which pages are near the viewport (only those get a canvas).
  useEffect(() => {
    const root = scroller.current;
    if (!root || !sizes.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        }),
      { root, rootMargin: "150% 0px" },
    );
    pageEls.current.slice(0, sizes.length).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [sizes]);

  // Keep the reading position when zooming.
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && prevScale.current !== scale) {
      const ratio = scale / prevScale.current;
      el.scrollTop = el.scrollTop * ratio;
      el.scrollLeft = el.scrollLeft * ratio;
    }
    prevScale.current = scale;
  }, [scale]);

  // Scroll to SyncTeX highlight.
  useEffect(() => {
    const box = highlight?.boxes[0];
    const el = scroller.current;
    const pageEl = box && pageEls.current[box.page - 1];
    if (!box || !el || !pageEl) return;
    const top = pageEl.offsetTop + (box.v - box.height) * scale - el.clientHeight / 3;
    el.scrollTo({ top, behavior: "smooth" });
  }, [highlight, scale]);

  // Ctrl/Cmd + wheel zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const cur = z === "fit" ? fitScale : z;
        return Math.min(4, Math.max(0.25, cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fitScale]);

  const step = (dir: 1 | -1) =>
    setZoom((z) => {
      const cur = z === "fit" ? fitScale : z;
      return Math.min(4, Math.max(0.25, Math.round((cur + dir * 0.15) * 100) / 100));
    });

  if (!data && !pdf) return null;

  return (
    <div className="relative h-full min-h-0">
      <div ref={scroller} className="scrollbar-thin h-full overflow-auto bg-zinc-100">
        {error && <div className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível abrir o PDF: {error}</div>}
        <div className="flex min-w-fit flex-col items-center" style={{ gap: GAP, padding: PAD }}>
          {sizes.map((s, i) => (
            <div
              key={i}
              data-index={i}
              ref={(el) => {
                pageEls.current[i] = el;
              }}
              className="pdf-page relative shrink-0 bg-white"
              style={{ width: s.w * scale, height: s.h * scale }}
              onDoubleClick={(e) => {
                if (!onInverseSearch) return;
                const rect = e.currentTarget.getBoundingClientRect();
                onInverseSearch(i + 1, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
              }}
              title={onInverseSearch ? "Clique duas vezes para ir ao código" : undefined}
            >
              {pdf && <PdfPage pdf={pdf} index={i} scale={scale} active={visible.has(i)} />}
              {highlight?.boxes
                .filter((b) => b.page === i + 1)
                .map((b, j) => (
                  <div
                    key={`${highlight.nonce}-${j}`}
                    className="synctex-box pointer-events-none absolute rounded-sm bg-amber-300/40 ring-1 ring-amber-400"
                    style={{
                      left: b.h * scale - 2,
                      top: (b.v - b.height) * scale - 2,
                      width: Math.max(b.width * scale, 8) + 4,
                      height: Math.max(b.height * scale, 8) + 4,
                    }}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-zinc-200 bg-white/95 p-1 text-zinc-600 shadow-lg backdrop-blur">
        <button className="rounded-full p-1.5 hover:bg-zinc-100" onClick={() => step(-1)} aria-label="Diminuir zoom">
          <Minus size={14} />
        </button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
        <button className="rounded-full p-1.5 hover:bg-zinc-100" onClick={() => step(1)} aria-label="Aumentar zoom">
          <Plus size={14} />
        </button>
        <span className="mx-0.5 h-4 w-px bg-zinc-200" />
        <button
          className={`rounded-full p-1.5 hover:bg-zinc-100 ${zoom === "fit" ? "text-zinc-900" : ""}`}
          onClick={() => setZoom("fit")}
          aria-label="Ajustar à largura"
          title="Ajustar à largura"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}

function PdfPage({ pdf, index, scale, active }: { pdf: PDFDocumentProxy; index: number; scale: number; active: boolean }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    if (!active) {
      el.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(index + 1);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) el.replaceChildren(canvas);
      } catch {
        /* cancelled or destroyed */
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, index, scale, active]);

  return <div ref={holder} className="absolute inset-0" />;
}
