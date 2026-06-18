"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, AlertCircle, MousePointer2 } from "lucide-react";

import PdfJsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";

if (!pdfjs.GlobalWorkerOptions.workerPort && typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfJsWorker();
}

/**
 * Pointer position broadcast by the leader.
 * Coordinates are NORMALIZED to the rendered page rect:
 *   x = pixelX / pageWidth   (0..1)
 *   y = pixelY / pageHeight  (0..1)
 * This keeps the pointer aligned across different screen sizes / zooms.
 */
export interface NormalizedPointer {
  x: number;
  y: number;
  visible: boolean;
}

interface PdfViewerProps {
  url?: string;
  data?: Uint8Array;
  sourceLabel?: string;
  page: number;
  onLoadSuccess?: (numPages: number) => void;

  // ---- Phase 4: Leader Presentation Mode ----
  /** Multiplier on top of the auto-fit width. Default 1. */
  zoom?: number;
  /** PDF rotation in degrees: 0 | 90 | 180 | 270. Default 0. */
  rotation?: number;
  /** Horizontal pan offset in CSS pixels (applied AFTER zoom). Default 0. */
  panX?: number;
  /** Vertical pan offset in CSS pixels (applied AFTER zoom). Default 0. */
  panY?: number;
  /**
   * When true, navigation gestures inside the PDF area are disabled
   * (used for participants while the leader is presenting).
   */
  locked?: boolean;
  /**
   * If provided, a pointer dot is rendered at the given normalized
   * position. Use this to show the LEADER'S pointer to participants.
   */
  remotePointer?: NormalizedPointer | null;
  /**
   * Fired whenever the leader moves the mouse over the page while
   * pointer mode is active. Coordinates are normalized (0..1).
   * Throttled to ~rAF by the caller is recommended.
   */
  onPointerMove?: (pos: NormalizedPointer) => void;
  /**
   * When true, the viewer treats mouse moves as live-pointer broadcasts
   * (only the leader should set this).
   */
  pointerMode?: boolean;
}

export function PdfViewer({
  url,
  data,
  sourceLabel,
  page,
  onLoadSuccess,
  zoom = 1,
  rotation = 0,
  panX = 0,
  panY = 0,
  locked = false,
  remotePointer = null,
  onPointerMove,
  pointerMode = false,
}: PdfViewerProps) {
  const [baseWidth, setBaseWidth] = useState<number>(800);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [appliedTransform, setAppliedTransform] = useState({ zoom, rotation, panX, panY });
  const file = useMemo(() => (data ? { data } : url), [data, url]);
  const displaySource = sourceLabel ?? (data ? "IndexedDB" : (url ?? ""));

  // Ref to the rendered page DOM node — used to compute normalized
  // pointer coords relative to the actual page rect.
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const lastBroadcast = useRef<number>(0);

  useEffect(() => {
    const update = () => {
      const w = Math.min(window.innerWidth - 32, 900);
      setBaseWidth(w);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    setError(null);
    setLoaded(false);
    console.log("[PdfViewer] loading PDF:", displaySource);
    console.log("[PdfViewer] pdfjs version:", pdfjs.version, "worker: inline");
  }, [displaySource, data, url]);

  useEffect(() => {
    setAppliedTransform({ zoom, rotation, panX, panY });
  }, [zoom, rotation, panX, panY]);

  // Effective render width — `zoom` multiplies the auto-fit base.
  // Clamp so we never blow up react-pdf with absurd sizes.
  const renderWidth = Math.max(120, Math.min(baseWidth * appliedTransform.zoom, 4000));

  // The outer wrapper handles pan via CSS transform so we don't have
  // to re-render the PDF on every pixel of drag.
  const transformStyle: React.CSSProperties = {
    transform: `translate(${appliedTransform.panX}px, ${appliedTransform.panY}px)`,
    transition: locked ? "transform 120ms ease-out" : undefined,
    willChange: "transform",
  };

  // ---------- Pointer move handler (leader only) ----------
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerMode || !onPointerMove) return;
    // Throttle to ~30 fps to keep broadcast volume sane.
    const now = performance.now();
    if (now - lastBroadcast.current < 33) return;
    lastBroadcast.current = now;

    const node = pageWrapRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // Clamp to [0,1] so a stray off-page event doesn't poison state.
    onPointerMove({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      visible: x >= 0 && x <= 1 && y >= 0 && y <= 1,
    });
  };

  const handlePointerLeave = () => {
    if (pointerMode && onPointerMove) {
      onPointerMove({ x: 0, y: 0, visible: false });
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-2" dir="ltr">
      {!loaded && !error && (
        <div className="flex items-center gap-2 text-muted-foreground py-4 text-sm" dir="rtl">
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري تحميل الملف...
        </div>
      )}
      {error && (
        <div
          className="w-full max-w-xl border border-destructive/30 bg-destructive/5 text-destructive rounded-lg p-4 text-sm"
          dir="rtl"
        >
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertCircle className="h-4 w-4" />
            تعذّر تحميل الملف
          </div>
          <div className="text-xs opacity-80 break-all">{error}</div>
          <div className="text-[10px] opacity-60 mt-2 break-all" dir="ltr">
            المصدر: {displaySource}
          </div>
        </div>
      )}

      {/* Pan + (participant) lock wrapper. The transform lives here so
          the PDF canvas itself doesn't have to re-layout for pan. */}
      <div
        className="relative max-w-full"
        style={transformStyle}
        // When locked, swallow wheel/touch so participants can't scroll
        // away from the leader's view.
        onWheelCapture={locked ? (e) => e.preventDefault() : undefined}
      >
        <div
          ref={pageWrapRef}
          className="relative"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          style={{
            cursor: pointerMode ? "crosshair" : locked ? "default" : "auto",
            pointerEvents: locked && !pointerMode ? "none" : "auto",
            userSelect: locked ? "none" : "auto",
          }}
        >
          {file && (
            <Document
              file={file}
              onLoadSuccess={({ numPages }) => {
                console.log("[PdfViewer] loaded", numPages, "pages");
                setLoaded(true);
                setError(null);
                onLoadSuccess?.(numPages);
              }}
              onLoadError={(err) => {
                console.error("[PdfViewer] load error:", err);
                setError(err?.message || String(err));
              }}
              onSourceError={(err) => {
                console.error("[PdfViewer] source error:", err);
                setError(err?.message || String(err));
              }}
              loading=""
              error=""
            >
              {loaded && (
                <Page
                  key={`${page}-${appliedTransform.rotation}-${Math.round(renderWidth)}`}
                  pageNumber={page}
                  width={renderWidth}
                  rotate={appliedTransform.rotation}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onRenderError={(err) => {
                    console.error("[PdfViewer] render error:", err);
                    setError(err?.message || String(err));
                  }}
                />
              )}
            </Document>
          )}

          {/* Remote leader pointer overlay (visible to participants). */}
          {remotePointer && remotePointer.visible && (
            <RemotePointerDot x={remotePointer.x} y={remotePointer.y} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A small pulsing dot rendered at normalized (x,y) inside the page rect.
 * Pure CSS — no extra deps.
 */
function RemotePointerDot({ x, y }: { x: number; y: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: "translate(-50%, -50%)",
        transition: "left 80ms linear, top 80ms linear",
      }}
    >
      <div className="relative">
        <span className="absolute inset-0 -m-2 rounded-full bg-primary/30 animate-ping" />
        <MousePointer2 className="relative h-5 w-5 text-primary drop-shadow" />
      </div>
    </div>
  );
}
