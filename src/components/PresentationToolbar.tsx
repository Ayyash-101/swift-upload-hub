"use client";
import {
  Presentation,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  MousePointer2,
  RefreshCcw,
  Lock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PresentationToolbarProps {
  /** Is the local user the session leader? */
  isLeader: boolean;
  /** Are we online — disables RPC-based buttons when offline. */
  online: boolean;
  /** Current persistent state from the sessions row. */
  presentationMode: boolean;
  zoom: number;
  rotation: number;
  /** Local-only flag: is the leader currently broadcasting a pointer? */
  pointerMode: boolean;
  /** Local-only flag: leader's drag-to-pan toggle. */
  panMode: boolean;

  // ---- Handlers (all leader-only; participants get a read-only badge) ----
  onTogglePresentation: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onTogglePointer: () => void;
  onTogglePan: () => void;
  onReset: () => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export function nextZoom(current: number, direction: 1 | -1): number {
  // Snap to the closest step, then move one in the given direction.
  const idx = ZOOM_STEPS.reduce(
    (best, z, i) => (Math.abs(z - current) < Math.abs(ZOOM_STEPS[best] - current) ? i : best),
    0,
  );
  const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + direction));
  return ZOOM_STEPS[nextIdx];
}

export function nextRotation(current: number): number {
  // 0 -> 90 -> 180 -> 270 -> 0
  return (((current + 90) % 360) + 360) % 360;
}

/**
 * Compact toolbar shown above the PDF. For leaders it's interactive;
 * for participants in presentation mode it shows a small read-only
 * "viewing leader's screen" badge.
 */
export function PresentationToolbar(props: PresentationToolbarProps) {
  const {
    isLeader,
    online,
    presentationMode,
    zoom,
    rotation,
    pointerMode,
    panMode,
    onTogglePresentation,
    onZoomIn,
    onZoomOut,
    onRotate,
    onTogglePointer,
    onTogglePan,
    onReset,
  } = props;

  // -------- Participant read-only view --------
  if (!isLeader) {
    if (!presentationMode) return null; // keep classic mode invisible
    return (
      <div
        className="sticky top-[60px] z-[9] mx-auto mb-3 inline-flex items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur-md"
        dir="rtl"
      >
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">وضع العرض نشط — تتابع شاشة القائد</span>
        <Lock className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  // -------- Leader interactive toolbar --------
  const disabled = !online;
  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      className="sticky top-[60px] z-[9] mx-auto mb-3 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-md"
      dir="rtl"
      role="toolbar"
      aria-label="أدوات وضع العرض"
    >
      <Button
        type="button"
        size="sm"
        variant={presentationMode ? "default" : "ghost"}
        className="h-8 gap-1.5 rounded-full px-3 text-xs"
        onClick={onTogglePresentation}
        disabled={disabled}
        title={presentationMode ? "إيقاف وضع العرض" : "بدء وضع العرض"}
      >
        <Presentation className="h-3.5 w-3.5" />
        {presentationMode ? "إيقاف العرض" : "بدء العرض"}
      </Button>

      <Divider />

      <ToolbarIcon
        label="تصغير"
        onClick={onZoomOut}
        disabled={disabled || zoom <= ZOOM_STEPS[0] + 0.001}
      >
        <ZoomOut className="h-4 w-4" />
      </ToolbarIcon>
      <span className="min-w-[42px] text-center text-xs font-medium tabular-nums text-muted-foreground">
        {zoomPct}%
      </span>
      <ToolbarIcon
        label="تكبير"
        onClick={onZoomIn}
        disabled={disabled || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.001}
      >
        <ZoomIn className="h-4 w-4" />
      </ToolbarIcon>

      <Divider />

      <ToolbarIcon
        label={`تدوير (${rotation}°)`}
        onClick={onRotate}
        disabled={disabled}
        active={rotation !== 0}
      >
        <RotateCw className="h-4 w-4" />
      </ToolbarIcon>

      <ToolbarIcon
        label={panMode ? "إيقاف التحريك" : "تفعيل التحريك"}
        onClick={onTogglePan}
        active={panMode}
        disabled={disabled}
      >
        <Move className="h-4 w-4" />
      </ToolbarIcon>

      <ToolbarIcon
        label={pointerMode ? "إخفاء المؤشّر" : "إظهار المؤشّر"}
        onClick={onTogglePointer}
        active={pointerMode}
        disabled={disabled}
      >
        <MousePointer2 className="h-4 w-4" />
      </ToolbarIcon>

      <Divider />

      <ToolbarIcon
        label="إعادة ضبط العرض"
        onClick={onReset}
        disabled={disabled || (zoom === 1 && rotation === 0)}
      >
        <RefreshCcw className="h-4 w-4" />
      </ToolbarIcon>
    </div>
  );
}

// ---------------- Internals ----------------

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;
}

function ToolbarIcon({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
