import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Upload,
  Copy,
  Check,
  Users,
  ArrowLeft,
  Loader2,
  Crown,
  BookOpen,
  Wifi,
  Share2,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { getUserId, getUserName } from "@/lib/sync-read";
import {
  cachePdf,
  cacheKeyFor,
  getCachedPdfData,
  installOnlineSync,
  queueProgress,
  syncLibraryEntry,
} from "@/lib/library";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfViewer, type NormalizedPointer } from "@/components/PdfViewer";
import { PageDiscussionPanel } from "@/components/PageDiscussionPanel";
import { PresentationToolbar, nextRotation, nextZoom } from "@/components/PresentationToolbar";
import type { Tables } from "@/integrations/supabase/types";

type Session = Tables<"sessions">;
type Participant = Tables<"participants">;

type SyncStatus = "offline" | "following" | "delayed" | "ahead";

const ONLINE_WINDOW_MS = 45_000;

// Phase 4 — Leader Presentation Mode
// Broadcast event names used on the existing per-session realtime channel.
const POINTER_EVENT = "leader-pointer";
// Low-latency presentation-state broadcast. The DB UPDATE still happens
// for persistence + late joiners, but participants apply the broadcast
// payload immediately (<100ms) instead of waiting for the postgres_changes
// round-trip.
const PRESENTATION_EVENT = "leader-presentation";

type PresentationPatch = Partial<{
  presentation_mode: boolean;
  zoom: number;
  rotation: number;
  pan_x: number;
  pan_y: number;
}>;
// Fallback defaults for sessions created BEFORE this migration ran.
// (Backward compat: types says the field is required, but a stale row
//  might still arrive over realtime without it. Coerce on read.)
function readPresentationState(s: Session) {
  return {
    presentation_mode: (s as Partial<Session>).presentation_mode ?? false,
    zoom: (s as Partial<Session>).zoom ?? 1,
    rotation: (s as Partial<Session>).rotation ?? 0,
    pan_x: (s as Partial<Session>).pan_x ?? 0,
    pan_y: (s as Partial<Session>).pan_y ?? 0,
  };
}

async function getSupabaseClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

function getSyncStatus(p: Participant, sessionPage: number, now: number): SyncStatus {
  const online = new Date(p.last_seen).getTime() > now - ONLINE_WINDOW_MS;
  if (!online) return "offline";
  if (p.current_page === sessionPage) return "following";
  if (p.current_page < sessionPage) return "delayed";
  return "ahead";
}

function formatRelative(iso: string, now: number): string {
  const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diff < 10) return "الآن";
  if (diff < 60) return `قبل ${diff} ث`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} ي`;
}

const STATUS_META: Record<SyncStatus, { label: string; color: string; dot: string }> = {
  following: {
    label: "متابِع",
    color: "text-[var(--color-success)]",
    dot: "bg-[var(--color-success)]",
  },
  delayed: {
    label: "متأخّر",
    color: "text-[var(--color-warning)]",
    dot: "bg-[var(--color-warning)]",
  },
  ahead: { label: "متقدّم", color: "text-primary", dot: "bg-primary" },
  offline: { label: "غير متصل", color: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

export const Route = createFileRoute("/session/$code")({
  component: SessionPage,
  ssr: false,
});

function SessionPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pdfDisplayUrl, setPdfDisplayUrl] = useState<string | null>(null);
  const [pdfCachedData, setPdfCachedData] = useState<Uint8Array | null>(null);
  const [cachingPdf, setCachingPdf] = useState(false);
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);
  const userId = typeof window !== "undefined" ? getUserId() : "";
  const isLeader = !!session && session.leader_id === userId;

  // ---- Phase 4: Leader Presentation Mode state ----
  // Local-only UI toggles (do NOT need to sync to the DB).
  const [pointerMode, setPointerMode] = useState(false);
  const [panMode, setPanMode] = useState(false);
  // The leader's pointer position as broadcast over realtime; rendered
  // on participants' PDFs. Cleared when leader disables pointer mode.
  const [remotePointer, setRemotePointer] = useState<NormalizedPointer | null>(null);
  // Holds the realtime channel ref so the leader's onPointerMove
  // handler can push broadcasts without re-subscribing.
  const channelRef = useRef<ReturnType<
    Awaited<ReturnType<typeof getSupabaseClient>>["channel"]
  > | null>(null);
  // Drag-to-pan working state (leader only, panMode on).
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const presentation = session
    ? readPresentationState(session)
    : {
        presentation_mode: false,
        zoom: 1,
        rotation: 0,
        pan_x: 0,
        pan_y: 0,
      };

  // Flush any queued progress + library entries when we come back online.
  useEffect(() => {
    if (!userId) return;
    return installOnlineSync(userId);
  }, [userId]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Initial load + restore progress
  useEffect(() => {
    let active = true;
    (async () => {
      if (!online) {
        toast.error("أنت غير متصل — سيتم فتح المكتبة المحلية");
        navigate({ to: "/library" });
        return;
      }
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        toast.error("الجلسة غير موجودة");
        navigate({ to: "/" });
        return;
      }

      // Restore saved progress for this user in this session
      const { data: progressRows } = await supabase.rpc("get_progress", {
        p_session_id: data.id,
        p_user_id: userId,
      });
      const progress = Array.isArray(progressRows) ? progressRows[0] : null;

      if (progress && data.leader_id === userId && progress.current_page !== data.current_page) {
        await supabase.rpc("update_session_page", {
          p_session_id: data.id,
          p_user_id: userId,
          p_page: progress.current_page,
        });
        data.current_page = progress.current_page;
        toast.success(`تم استئناف القراءة من الصفحة ${progress.current_page}`);
      } else if (progress && data.leader_id !== userId) {
        toast.success(`أهلاً بعودتك — كنت عند الصفحة ${progress.current_page}`);
      }

      setSession(data);

      // Ensure I'm a participant
      const name = getUserName() || "ضيف";
      await supabase.rpc("upsert_participant", {
        p_session_id: data.id,
        p_user_id: userId,
        p_name: name,
        p_current_page: progress?.current_page ?? data.current_page,
      });

      const { data: parts } = await supabase
        .from("participants")
        .select("*")
        .eq("session_id", data.id)
        .order("created_at", { ascending: true });
      if (parts) setParticipants(parts);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [code, navigate, online, userId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!session || !online) return;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>["channel"]> | null = null;
    let supabaseClient: Awaited<ReturnType<typeof getSupabaseClient>> | null = null;
    void (async () => {
      const supabase = await getSupabaseClient();
      supabaseClient = supabase;
      channel = supabase
        .channel(`session-${session.id}`, {
          // Receive our own broadcasts? No — leader doesn't need to render
          // its own pointer (it has a real OS cursor).
          config: { broadcast: { self: false } },
        })
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${session.id}` },
          (payload: { new: unknown }) => {
            setSession(payload.new as Session);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "participants",
            filter: `session_id=eq.${session.id}`,
          },
          async () => {
            const { data } = await supabase
              .from("participants")
              .select("*")
              .eq("session_id", session.id)
              .order("created_at", { ascending: true });
            if (data) setParticipants(data);
          },
        )
        // Phase 4: ephemeral leader pointer position. We deliberately do
        // NOT persist this — pointer-frequency writes to Postgres would
        // be wasteful and risk hitting realtime quotas.
        .on("broadcast", { event: POINTER_EVENT }, (payload) => {
          const p = (payload?.payload ?? null) as NormalizedPointer | null;
          if (!p) return;
          setRemotePointer(p.visible ? p : null);
        })
        // Phase 4: low-latency presentation-state sync. Only participants
        // need to apply incoming patches — the leader is the publisher
        // and already updates local state optimistically. Guarding on
        // `is_from_leader` (and the leader_id check in setSession below)
        // also defends against a stray client trying to publish.
        .on("broadcast", { event: PRESENTATION_EVENT }, (payload) => {
          const patch = (payload?.payload ?? null) as
            | (PresentationPatch & { leader_id?: string })
            | null;
          if (!patch) return;
          setSession((prev) => {
            if (!prev) return prev;
            // Feedback-loop guard: ignore broadcasts that didn't come from
            // the session's actual leader, and ignore our own echoes.
            if (patch.leader_id && patch.leader_id !== prev.leader_id) return prev;
            if (prev.leader_id === userId) return prev;
            const next = { ...prev } as Session;
            if (patch.presentation_mode !== undefined)
              next.presentation_mode = patch.presentation_mode;
            if (patch.zoom !== undefined) next.zoom = patch.zoom;
            if (patch.rotation !== undefined) next.rotation = patch.rotation;
            if (patch.pan_x !== undefined) next.pan_x = patch.pan_x;
            if (patch.pan_y !== undefined) next.pan_y = patch.pan_y;
            return next;
          });
        })
        .subscribe();
      channelRef.current = channel;
    })();
    return () => {
      channelRef.current = null;
      if (channel && supabaseClient) supabaseClient.removeChannel(channel);
    };
  }, [online, session?.id]);

  // When the leader disables pointer mode, sweep any lingering dot.
  useEffect(() => {
    if (!isLeader) return;
    if (pointerMode) return;
    // Tell participants to drop the dot immediately.
    channelRef.current?.send({
      type: "broadcast",
      event: POINTER_EVENT,
      payload: { x: 0, y: 0, visible: false } satisfies NormalizedPointer,
    });
  }, [isLeader, pointerMode]);

  // If a non-leader, never keep stale local-only toggles around
  // (e.g. after losing leader role somehow).
  useEffect(() => {
    if (!isLeader && (pointerMode || panMode)) {
      setPointerMode(false);
      setPanMode(false);
    }
  }, [isLeader, pointerMode, panMode]);

  // Heartbeat: update my current page + last_seen
  useEffect(() => {
    if (!session || !online) return;
    const update = async () => {
      const supabase = await getSupabaseClient();
      await supabase.rpc("participant_heartbeat", {
        p_session_id: session.id,
        p_user_id: userId,
        p_current_page: session.current_page,
      });
    };
    update();
    const interval = setInterval(update, 20_000);
    return () => clearInterval(interval);
  }, [online, session?.current_page, session?.id, userId]);

  // Persist reading progress: on page change + every 10s. Falls back to a local queue when offline.
  useEffect(() => {
    if (!session) return;
    let lastTick = Date.now();
    let accumulated = 0;
    const save = async (extraSeconds: number) => {
      accumulated += Math.max(0, Math.floor(extraSeconds));
      const payload = {
        session_id: session.id,
        user_id: userId,
        current_page: session.current_page,
        reading_time_seconds: accumulated,
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueProgress(payload);
        return;
      }
      try {
        const supabase = await getSupabaseClient();
        await supabase.rpc("upsert_progress", {
          p_session_id: payload.session_id,
          p_user_id: payload.user_id,
          p_current_page: payload.current_page,
          p_reading_time_seconds: payload.reading_time_seconds,
        });
      } catch {
        queueProgress(payload);
      }
    };
    save(0); // immediate save on page change
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      save(delta);
    }, 10_000);
    const onUnload = () => {
      const delta = (Date.now() - lastTick) / 1000;
      void save(delta);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
  }, [session?.current_page, session?.id, userId]);

  // Cache the PDF locally + register it in the user's library.
  useEffect(() => {
    if (!session?.pdf_url) {
      setPdfDisplayUrl(null);
      setPdfCachedData(null);
      return;
    }
    let active = true;
    (async () => {
      const key = cacheKeyFor(session.pdf_url!);
      // Always register/refresh the library entry (even before download finishes).
      void syncLibraryEntry({
        user_id: userId,
        session_id: session.id,
        title: session.book_name || "كتاب",
        pdf_url: session.pdf_url!,
        local_cache_key: key,
        total_pages: session.total_pages,
        last_page: session.current_page,
        last_opened: new Date().toISOString(),
      });
      // Prefer the cached blob if we already have it.
      const cachedData = await getCachedPdfData(key);
      if (cachedData) {
        if (active) {
          setPdfCachedData(cachedData);
          setPdfDisplayUrl(null);
        }
        return;
      }
      // Offline + no cache → nothing we can do; show remote URL (will fail gracefully).
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (active) {
          setPdfCachedData(null);
          setPdfDisplayUrl(null);
        }
        return;
      }
      try {
        if (active) setCachingPdf(true);
        await cachePdf(session.pdf_url!);
        const data = await getCachedPdfData(key);
        if (active) {
          setPdfCachedData(data);
          setPdfDisplayUrl(data ? null : session.pdf_url);
        }
      } catch (e) {
        console.error("[session] failed to cache PDF", e);
        if (active) {
          setPdfCachedData(null);
          setPdfDisplayUrl(session.pdf_url);
        }
      } finally {
        if (active) setCachingPdf(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session?.pdf_url, session?.id, session?.book_name, userId]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("تم نسخ الرمز");
    setTimeout(() => setCopied(false), 1500);
  };

  const buildJoinLink = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${encodeURIComponent(code)}`
      : `/join?code=${encodeURIComponent(code)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(buildJoinLink());
    toast.success("تم نسخ الرابط");
  };

  const shareSession = async () => {
    const url = buildJoinLink();
    const shareData = {
      title: session?.book_name || "جلسة قراءة",
      text: `انضم لجلسة القراءة "${session?.book_name ?? ""}" برمز ${code}`,
      url,
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    await copyLink();
  };

  const goToPage = async (next: number) => {
    if (!session || !isLeader || !online) return;
    if (next < 1 || (session.total_pages > 0 && next > session.total_pages)) return;
    const supabase = await getSupabaseClient();
    await supabase.rpc("update_session_page", {
      p_session_id: session.id,
      p_user_id: userId,
      p_page: next,
    });
  };

  // ---------------- Phase 4: presentation handlers (leader-only) ----------------

  /**
   * Patches presentation state on the server. We pass only the fields
   * that changed; the RPC uses COALESCE so NULLs leave them alone.
   * Optimistically applies the change locally so the leader's UI feels
   * instant — the realtime echo will reconcile if anything diverges.
   */
  const patchPresentation = useCallback(
    async (patch: PresentationPatch) => {
      if (!session || !isLeader || !online) return;
      setSession((prev) => (prev ? ({ ...prev, ...patch } as Session) : prev));
      // Push to participants immediately over the realtime channel so they
      // apply zoom/pan/rotation in well under 100ms — the DB write below
      // is still the source of truth for late joiners.
      channelRef.current?.send({
        type: "broadcast",
        event: PRESENTATION_EVENT,
        payload: { ...patch, leader_id: session.leader_id },
      });
      try {
        const supabase = await getSupabaseClient();
        const { error: rpcErr } = await supabase.rpc("update_presentation_state", {
          p_session_id: session.id,
          p_user_id: userId,
          p_presentation_mode: patch.presentation_mode ?? undefined,
          p_zoom: patch.zoom ?? undefined,
          p_rotation: patch.rotation ?? undefined,
          p_pan_x: patch.pan_x ?? undefined,
          p_pan_y: patch.pan_y ?? undefined,
        });
        if (rpcErr) throw rpcErr;
      } catch (err) {
        console.error("[session] update_presentation_state failed", err);
        toast.error("تعذّر تحديث حالة العرض");
      }
    },
    [isLeader, online, session, userId],
  );

  const handleTogglePresentation = useCallback(() => {
    const turningOn = !presentation.presentation_mode;
    // Reset zoom/rotation/pan when leaving presentation mode, so the
    // free-reading UX doesn't feel "stuck" at a leftover zoom.
    void patchPresentation(
      turningOn
        ? { presentation_mode: true }
        : { presentation_mode: false, zoom: 1, rotation: 0, pan_x: 0, pan_y: 0 },
    );
    if (!turningOn) {
      setPointerMode(false);
      setPanMode(false);
    }
  }, [patchPresentation, presentation.presentation_mode]);

  const handleZoomIn = useCallback(
    () => void patchPresentation({ zoom: nextZoom(presentation.zoom, 1) }),
    [patchPresentation, presentation.zoom],
  );
  const handleZoomOut = useCallback(
    () => void patchPresentation({ zoom: nextZoom(presentation.zoom, -1) }),
    [patchPresentation, presentation.zoom],
  );
  const handleRotate = useCallback(
    () => void patchPresentation({ rotation: nextRotation(presentation.rotation) }),
    [patchPresentation, presentation.rotation],
  );
  const handleReset = useCallback(
    () => void patchPresentation({ zoom: 1, rotation: 0, pan_x: 0, pan_y: 0 }),
    [patchPresentation],
  );
  const handleTogglePointer = useCallback(() => setPointerMode((v) => !v), []);
  const handleTogglePan = useCallback(() => setPanMode((v) => !v), []);

  /**
   * Leader's pointer broadcast. Throttling already happens inside
   * PdfViewer (~30fps); we just forward the latest sample.
   */
  const handleLeaderPointerMove = useCallback(
    (pos: NormalizedPointer) => {
      if (!isLeader || !pointerMode) return;
      channelRef.current?.send({
        type: "broadcast",
        event: POINTER_EVENT,
        payload: pos,
      });
    },
    [isLeader, pointerMode],
  );

  // ---------------- Drag-to-pan (leader only, when panMode on) ----------------
  // We attach pointer listeners at the wrapper level so the PDF canvas
  // itself doesn't have to know about panning.
  const onPanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLeader || !panMode || !session) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: presentation.pan_x,
      baseY: presentation.pan_y,
    };
  };
  const onPanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = panDragRef.current;
    if (!d) return;
    // Live local feedback — update session state only; we'll push to
    // the server on pointerup to avoid spamming RPCs.
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setSession((prev) =>
      prev ? ({ ...prev, pan_x: d.baseX + dx, pan_y: d.baseY + dy } as Session) : prev,
    );
  };
  const onPanPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = panDragRef.current;
    panDragRef.current = null;
    if (!d || !session) return;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // Commit final pan to the DB once.
    void patchPresentation({
      pan_x: presentation.pan_x,
      pan_y: presentation.pan_y,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    if (file.type !== "application/pdf") {
      toast.error("الملف يجب أن يكون PDF");
      return;
    }
    if (!online) {
      toast.error("لا يمكن رفع ملف أثناء عدم الاتصال");
      return;
    }
    setUploading(true);
    try {
      const supabase = await getSupabaseClient();
      const path = `${session.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("pdfs").upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("pdfs")
        .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
      if (sErr) throw sErr;
      await supabase.rpc("update_session_pdf", {
        p_session_id: session.id,
        p_user_id: userId,
        p_pdf_url: signed.signedUrl,
        p_book_name: file.name.replace(/\.pdf$/i, ""),
      });
      toast.success("تم رفع الملف");
    } catch (err) {
      console.error(err);
      toast.error("تعذّر رفع الملف");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const stats = useMemo(() => {
    const counts = { following: 0, delayed: 0, ahead: 0, offline: 0 };
    const currentPage = session?.current_page ?? 0;
    for (const p of participants) counts[getSyncStatus(p, currentPage, now)]++;
    const online = counts.following + counts.delayed + counts.ahead;
    return { ...counts, online, total: participants.length };
  }, [participants, session?.current_page, now]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{session.book_name}</h1>
            <button
              onClick={copyCode}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
            >
              <span>الرمز:</span>
              <span className="font-mono font-bold tracking-widest text-primary">{code}</span>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <button
            onClick={copyLink}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground hidden sm:inline-flex"
            aria-label="نسخ الرابط"
            title="نسخ رابط الانضمام"
          >
            <Link2 className="h-5 w-5" />
          </button>
          <button
            onClick={shareSession}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="مشاركة الجلسة"
            title="مشاركة الجلسة"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowParticipants((v) => !v)}
            className="relative p-2 rounded-lg hover:bg-muted"
            aria-label="المشاركون"
          >
            <Users className="h-5 w-5" />
            <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] rounded-full h-4 min-w-4 px-1 flex items-center justify-center font-bold">
              {stats.online}
            </span>
          </button>
        </div>
      </header>

      {/* Monitoring panel */}
      {showParticipants && (
        <div className="border-b bg-card">
          <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
            {isLeader && (
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-xl font-black">{stats.total}</div>
                  <div className="text-[11px] text-muted-foreground">مشارك</div>
                </Card>
                <Card className="p-3 text-center">
                  <Wifi className="h-4 w-4 mx-auto text-[var(--color-success)] mb-1" />
                  <div className="text-xl font-black">{stats.online}</div>
                  <div className="text-[11px] text-muted-foreground">نشِط الآن</div>
                </Card>
                <Card className="p-3 text-center">
                  <BookOpen className="h-4 w-4 mx-auto text-primary mb-1" />
                  <div className="text-xl font-black">{session.current_page}</div>
                  <div className="text-[11px] text-muted-foreground">الصفحة الحالية</div>
                </Card>
              </div>
            )}

            {isLeader && stats.total > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                <StatusChip status="following" count={stats.following} />
                <StatusChip status="delayed" count={stats.delayed} />
                <StatusChip status="ahead" count={stats.ahead} />
                <StatusChip status="offline" count={stats.offline} />
              </div>
            )}

            <div className="space-y-1.5">
              {participants.map((p) => {
                const status = getSyncStatus(p, session.current_page, now);
                const meta = STATUS_META[status];
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 text-sm py-2 px-3 rounded-md hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="font-medium truncate">{p.name}</span>
                      {p.is_leader && (
                        <Crown className="h-3.5 w-3.5 text-[var(--color-warning)] shrink-0" />
                      )}
                      {p.user_id === userId && (
                        <span className="text-xs text-muted-foreground shrink-0">(أنت)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-muted-foreground tabular-nums">ص {p.current_page}</span>
                      <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                      <span className="text-muted-foreground hidden sm:inline">
                        {formatRelative(p.last_seen, now)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PDF area */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {!session.pdf_url ? (
          <Card className="p-10 text-center">
            {isLeader ? (
              <>
                <Upload className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h2 className="font-bold text-lg mb-1">ارفع ملف PDF لبدء القراءة</h2>
                <p className="text-muted-foreground text-sm mb-5">
                  سيتم مشاركة الملف تلقائياً مع جميع المشاركين.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleUpload}
                />
                <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="lg">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-4 w-4 ml-2" />
                      اختيار ملف
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-muted-foreground">في انتظار القائد لرفع الملف...</p>
              </>
            )}
          </Card>
        ) : !pdfCachedData && !pdfDisplayUrl ? (
          <Card className="p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-muted-foreground text-sm">
              {cachingPdf ? "جاري حفظ الكتاب للقراءة دون اتصال..." : "جاري تجهيز الملف..."}
            </p>
          </Card>
        ) : (
          <div
            onPointerDown={onPanPointerDown}
            onPointerMove={onPanPointerMove}
            onPointerUp={onPanPointerUp}
            onPointerCancel={onPanPointerUp}
            style={{
              touchAction: panMode ? "none" : undefined,
              cursor: panMode ? "grab" : undefined,
            }}
          >
            <PresentationToolbar
              isLeader={isLeader}
              online={online}
              presentationMode={presentation.presentation_mode}
              zoom={presentation.zoom}
              rotation={presentation.rotation}
              pointerMode={pointerMode}
              panMode={panMode}
              onTogglePresentation={handleTogglePresentation}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onRotate={handleRotate}
              onTogglePointer={handleTogglePointer}
              onTogglePan={handleTogglePan}
              onReset={handleReset}
            />
            <PdfViewer
              data={pdfCachedData ?? undefined}
              url={pdfCachedData ? undefined : (pdfDisplayUrl ?? undefined)}
              sourceLabel={pdfCachedData ? "IndexedDB" : undefined}
              page={session.current_page}
              zoom={presentation.zoom}
              rotation={presentation.rotation}
              panX={presentation.pan_x}
              panY={presentation.pan_y}
              // Lock all gestures on participants while the leader is
              // presenting — they should see exactly the leader's view.
              locked={!isLeader && presentation.presentation_mode}
              pointerMode={isLeader && pointerMode}
              remotePointer={!isLeader ? remotePointer : null}
              onPointerMove={isLeader ? handleLeaderPointerMove : undefined}
              onLoadSuccess={async (numPages) => {
                if (isLeader && online && numPages !== session.total_pages) {
                  const supabase = await getSupabaseClient();
                  await supabase.rpc("set_session_total_pages", {
                    p_session_id: session.id,
                    p_user_id: userId,
                    p_total: numPages,
                  });
                }
                // Keep the local library entry's total_pages and last_page fresh.
                void syncLibraryEntry({
                  user_id: userId,
                  session_id: session.id,
                  title: session.book_name || "كتاب",
                  pdf_url: session.pdf_url!,
                  local_cache_key: cacheKeyFor(session.pdf_url!),
                  total_pages: numPages,
                  last_page: session.current_page,
                  last_opened: new Date().toISOString(),
                });
              }}
            />
          </div>
        )}
      </div>

      {/* Page notes & discussion */}
      {session.pdf_url && (
        <PageDiscussionPanel
          sessionId={session.id}
          pageNumber={session.current_page}
          userId={userId}
          userName={getUserName() || "ضيف"}
          isLeader={isLeader}
          online={online}
        />
      )}

      {/* Navigation bar */}
      {session.pdf_url && (
        <footer className="sticky bottom-0 border-t bg-card/90 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="icon"
              // Participants get their nav buttons fully removed-by-disable
              // when the leader is presenting — they must follow the leader.
              disabled={
                !isLeader ||
                session.current_page <= 1 ||
                (!isLeader && presentation.presentation_mode)
              }
              onClick={() => goToPage(session.current_page - 1)}
              aria-label="السابق"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>

            <div className="text-center">
              <div className="text-sm font-bold">
                صفحة {session.current_page}
                {session.total_pages > 0 ? ` / ${session.total_pages}` : ""}
              </div>
              {!isLeader && (
                <div className="text-xs text-muted-foreground">
                  {presentation.presentation_mode
                    ? "تتابع شاشة القائد — التنقّل مقفل"
                    : "المتابعة تلقائية مع القائد"}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="icon"
              disabled={
                !isLeader ||
                (session.total_pages > 0 && session.current_page >= session.total_pages) ||
                (!isLeader && presentation.presentation_mode)
              }
              onClick={() => goToPage(session.current_page + 1)}
              aria-label="التالي"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        </footer>
      )}
    </main>
  );
}

function StatusChip({ status, count }: { status: SyncStatus; count: number }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted">
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      <span className={`font-medium ${meta.color}`}>{meta.label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}
