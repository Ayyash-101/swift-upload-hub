"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Crown,
  MessageSquare,
  Pin,
  Send,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MessageType = "leader_note" | "discussion_message";

interface PageMessage {
  id: string;
  session_id: string;
  page_number: number;
  participant_id: string;
  participant_name: string;
  content: string;
  type: MessageType;
  created_at: string;
  updated_at: string;
}

interface Props {
  sessionId: string;
  pageNumber: number;
  userId: string;
  userName: string;
  isLeader: boolean;
  online?: boolean;
}

async function getSupabaseClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hm = d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hm : `${d.toLocaleDateString("ar")} ${hm}`;
}

export function PageDiscussionPanel({
  sessionId,
  pageNumber,
  userId,
  userName,
  isLeader,
  online = true,
}: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"notes" | "discussion">(isLeader ? "notes" : "discussion");
  const [messages, setMessages] = useState<PageMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load history when page or session changes
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    (async () => {
      if (!online) {
        if (active) setLoading(false);
        return;
      }
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase
        .from("page_discussions")
        .select("*")
        .eq("session_id", sessionId)
        .eq("page_number", pageNumber)
        .order("created_at", { ascending: true });
      if (!active) return;
      if (!error && data) setMessages(data as PageMessage[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [online, sessionId, pageNumber]);

  // Realtime
  useEffect(() => {
    if (!online) return;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabaseClient>>["channel"]> | null = null;
    let supabaseClient: Awaited<ReturnType<typeof getSupabaseClient>> | null = null;
    void (async () => {
      const supabase = await getSupabaseClient();
      supabaseClient = supabase;
      channel = supabase
        .channel(`page-discussions-${sessionId}-${pageNumber}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "page_discussions",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload: { eventType: string; new: unknown; old: unknown }) => {
            const row = (payload.new ?? payload.old) as PageMessage | undefined;
            if (!row || row.page_number !== pageNumber) return;
            setMessages((prev) => {
              if (payload.eventType === "DELETE") {
                return prev.filter((m) => m.id !== row.id);
              }
              if (payload.eventType === "INSERT") {
                if (prev.some((m) => m.id === row.id)) return prev;
                return [...prev, payload.new as PageMessage].sort((a, b) =>
                  a.created_at.localeCompare(b.created_at),
                );
              }
              return prev.map((m) => (m.id === row.id ? (payload.new as PageMessage) : m));
            });
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel && supabaseClient) supabaseClient.removeChannel(channel);
    };
  }, [online, sessionId, pageNumber]);

  // Auto-scroll to bottom of discussion on new message
  useEffect(() => {
    if (tab !== "discussion") return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, tab]);

  const leaderNotes = useMemo(() => messages.filter((m) => m.type === "leader_note"), [messages]);
  const discussion = useMemo(
    () => messages.filter((m) => m.type === "discussion_message"),
    [messages],
  );

  const send = async (asLeaderNote: boolean) => {
    const text = draft.trim();
    if (!text) return;
    if (!userName) {
      toast.error("اكتب اسمك أولاً");
      return;
    }
    if (!online) {
      toast.error("النقاش غير متاح أثناء عدم الاتصال");
      return;
    }
    setSending(true);
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc("post_page_message", {
      p_session_id: sessionId,
      p_page_number: pageNumber,
      p_user_id: userId,
      p_user_name: userName,
      p_content: text,
      p_is_leader_note: asLeaderNote,
    });
    setSending(false);
    if (error) {
      console.error(error);
      toast.error("تعذّر الإرسال");
      return;
    }
    setDraft("");
  };

  const saveEdit = async (id: string) => {
    const text = editingDraft.trim();
    if (!text) return;
    if (!online) {
      toast.error("التعديل غير متاح أثناء عدم الاتصال");
      return;
    }
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc("update_page_message", {
      p_message_id: id,
      p_user_id: userId,
      p_content: text,
    });
    if (error) {
      toast.error("تعذّر التعديل");
      return;
    }
    setEditingId(null);
    setEditingDraft("");
  };

  const remove = async (id: string) => {
    if (!online) {
      toast.error("الحذف غير متاح أثناء عدم الاتصال");
      return;
    }
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc("delete_page_message", {
      p_message_id: id,
      p_user_id: userId,
    });
    if (error) toast.error("تعذّر الحذف");
  };

  const canEdit = (m: PageMessage) => m.participant_id === userId;
  const canDelete = (m: PageMessage) => m.participant_id === userId || isLeader;

  const renderMessage = (m: PageMessage) => {
    const isNote = m.type === "leader_note";
    const editing = editingId === m.id;
    return (
      <div
        key={m.id}
        className={
          "rounded-lg p-3 text-sm border " +
          (isNote
            ? "bg-[var(--color-warning)]/10 border-[var(--color-warning)]/40"
            : "bg-card border-border")
        }
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {isNote && <Pin className="h-3.5 w-3.5 text-[var(--color-warning)] shrink-0" />}
            <span className="font-bold truncate">{m.participant_name}</span>
            {isNote && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 bg-[var(--color-warning)] text-black">
                <Crown className="h-3 w-3" />
                القائد
              </span>
            )}
            <span className="text-[11px] text-muted-foreground shrink-0">
              ص {m.page_number} · {formatTime(m.created_at)}
              {m.updated_at !== m.created_at ? " · مُعدَّل" : ""}
            </span>
          </div>
          {!editing && (canEdit(m) || canDelete(m)) && (
            <div className="flex items-center gap-1 shrink-0">
              {canEdit(m) && (
                <button
                  onClick={() => {
                    setEditingId(m.id);
                    setEditingDraft(m.content);
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  aria-label="تعديل"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete(m) && (
                <button
                  onClick={() => remove(m.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-destructive"
                  aria-label="حذف"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={editingDraft}
              onChange={(e) => setEditingDraft(e.target.value)}
              dir="rtl"
              rows={3}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveEdit(m.id)}>
                <Check className="h-4 w-4 ml-1" /> حفظ
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setEditingDraft("");
                }}
              >
                <X className="h-4 w-4 ml-1" /> إلغاء
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
        )}
      </div>
    );
  };

  return (
    <section className="border-t bg-background" dir="rtl">
      <div className="max-w-5xl mx-auto px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between py-3 text-sm font-bold"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span>الملاحظات والنقاش — صفحة {pageNumber}</span>
            {(leaderNotes.length > 0 || discussion.length > 0) && (
              <span className="text-xs font-medium text-muted-foreground">
                ({leaderNotes.length} ملاحظة · {discussion.length} رسالة)
              </span>
            )}
          </div>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {open && (
          <div className="pb-4 space-y-3">
            {/* Tabs */}
            <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
              <button
                onClick={() => setTab("notes")}
                className={
                  "px-3 py-1.5 rounded-md font-medium transition " +
                  (tab === "notes"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                ملاحظات ({leaderNotes.length})
              </button>
              <button
                onClick={() => setTab("discussion")}
                className={
                  "px-3 py-1.5 rounded-md font-medium transition " +
                  (tab === "discussion"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                نقاش ({discussion.length})
              </button>
            </div>

            {/* List */}
            <div ref={listRef} className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : tab === "notes" ? (
                leaderNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    لا توجد ملاحظات للقائد على هذه الصفحة بعد.
                  </p>
                ) : (
                  leaderNotes.map(renderMessage)
                )
              ) : discussion.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  ابدأ النقاش حول هذه الصفحة.
                </p>
              ) : (
                discussion.map(renderMessage)
              )}
            </div>

            {/* Composer */}
            <div className="space-y-2 pt-1">
              <Textarea
                dir="rtl"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  tab === "notes" && isLeader
                    ? `اكتب ملاحظة مثبَّتة للصفحة ${pageNumber}...`
                    : `شارك تعليقاً أو سؤالاً حول الصفحة ${pageNumber}...`
                }
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send(tab === "notes" && isLeader);
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {tab === "notes" && isLeader
                    ? "ستُنشر كملاحظة قائد مثبَّتة."
                    : "ستظهر فوراً لجميع المشاركين."}
                </p>
                <div className="flex gap-2">
                  {tab === "notes" && !isLeader ? null : (
                    <Button
                      size="sm"
                      onClick={() => send(tab === "notes" && isLeader)}
                      disabled={sending || !draft.trim()}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 ml-1" />
                          {tab === "notes" && isLeader ? "نشر ملاحظة" : "إرسال"}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {tab === "notes" && !isLeader && (
                <p className="text-xs text-muted-foreground text-center">
                  الملاحظات المثبَّتة يكتبها القائد فقط. يمكنك المشاركة في تبويب «نقاش».
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
