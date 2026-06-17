import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Loader2, Library, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { getUserId } from "@/lib/sync-read";
import {
  getCachedPdfData,
  getCachedPdfInfo,
  getLocalLibrary,
  offlineBookIdForCacheKey,
  refreshLibrary,
  removeCachedPdf,
  removeLocalLibrary,
  upsertLocalLibrary,
  type LibraryEntry,
} from "@/lib/library";

export const Route = createFileRoute("/library")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "مكتبتي — SyncRead" },
      { name: "description", content: "كتبك المحفوظة للقراءة دون اتصال." },
    ],
  }),
  component: LibraryPage,
});

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function LibraryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cachedMap, setCachedMap] = useState<Record<string, boolean>>({});
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserId();
    let active = true;
    (async () => {
      const local = getLocalLibrary(userId);
      if (!active) return;
      setEntries(local);
      const flags: Record<string, boolean> = {};
      for (const e of local) {
        const info = await getCachedPdfInfo(e.local_cache_key);
        flags[e.local_cache_key] = info.exists && info.looksLikePdf && info.byteLength > 0;
      }
      if (active) setCachedMap(flags);
      setLoading(false);
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const list = await refreshLibrary(userId);
      if (!active) return;
      setEntries(list);
      const refreshedFlags: Record<string, boolean> = {};
      for (const e of list) {
        const info = await getCachedPdfInfo(e.local_cache_key);
        refreshedFlags[e.local_cache_key] = info.exists && info.looksLikePdf && info.byteLength > 0;
      }
      if (active) setCachedMap(refreshedFlags);
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      active = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const openEntry = async (entry: LibraryEntry) => {
    setOpening(entry.local_cache_key);
    try {
      const cacheInfo = await getCachedPdfInfo(entry.local_cache_key);
      const pdfData = cacheInfo.exists ? await getCachedPdfData(entry.local_cache_key) : null;

      // Offline Reader Mode is strictly local: IndexedDB only, no backend, no session route.
      if (pdfData && cacheInfo.looksLikePdf) {
        const updated = { ...entry, last_opened: new Date().toISOString() };
        upsertLocalLibrary(updated);
        setCachedMap((prev) => ({ ...prev, [entry.local_cache_key]: true }));
        setEntries((prev) =>
          prev.map((item) => (item.local_cache_key === updated.local_cache_key ? updated : item)),
        );
        navigate({
          to: "/offline-read/$bookId",
          params: { bookId: offlineBookIdForCacheKey(entry.local_cache_key) },
        });
        return;
      }

      setCachedMap((prev) => ({ ...prev, [entry.local_cache_key]: false }));
      if (!online) {
        toast.error(
          cacheInfo.exists
            ? "النسخة المحلية غير مكتملة — افتح الكتاب عبر الإنترنت لإعادة حفظه"
            : "هذا الكتاب غير محفوظ محلياً — يلزم الاتصال بالإنترنت",
        );
        return;
      }

      // Not cached and online: try rejoining the session to download fresh.
      if (entry.session_id && online) {
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data } = await supabase
            .from("sessions")
            .select("code")
            .eq("id", entry.session_id)
            .maybeSingle();
          if (data?.code) {
            navigate({ to: "/session/$code", params: { code: data.code } });
            return;
          }
        } catch (e) {
          console.warn("[library] session lookup failed", e);
        }
      }
      toast.error("تعذّر فتح الكتاب من النسخة المحلية");
    } finally {
      setOpening(null);
    }
  };

  const removeEntry = async (entry: LibraryEntry) => {
    if (!confirm(`حذف "${entry.title}" من المكتبة؟`)) return;
    const userId = getUserId();
    try {
      await removeCachedPdf(entry.local_cache_key);
      removeLocalLibrary(userId, entry.local_cache_key);
      if (online && entry.id) {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.rpc("delete_library_book", { p_user_id: userId, p_id: entry.id });
      }
      setEntries((prev) => prev.filter((e) => e.local_cache_key !== entry.local_cache_key));
      toast.success("تم الحذف");
    } catch (e) {
      console.error(e);
      toast.error("تعذّر الحذف");
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" />
              مكتبتي
            </h1>
            <p className="text-xs text-muted-foreground">كتبك المحفوظة محلياً للقراءة دون اتصال</p>
          </div>
          {!online && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <WifiOff className="h-3.5 w-3.5" />
              غير متصل
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <Card className="p-10 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="font-bold text-lg mb-1">لا توجد كتب بعد</h2>
            <p className="text-muted-foreground text-sm mb-5">
              افتح أي كتاب في جلسة قراءة وسيُحفظ تلقائياً هنا للوصول السريع لاحقاً.
            </p>
            <Button asChild>
              <Link to="/">العودة للرئيسية</Link>
            </Button>
          </Card>
        ) : (
          entries.map((entry) => {
            const cached = !!cachedMap[entry.local_cache_key];
            return (
              <Card key={entry.local_cache_key} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{entry.title}</h3>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        آخر صفحة:{" "}
                        <span className="font-bold text-foreground">{entry.last_page}</span>
                        {entry.total_pages > 0 ? ` / ${entry.total_pages}` : ""}
                      </span>
                      <span>آخر فتح: {formatDate(entry.last_opened)}</span>
                      <span
                        className={cached ? "text-[var(--color-success)]" : "text-muted-foreground"}
                      >
                        {cached ? "محفوظ محلياً" : "غير محفوظ"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => openEntry(entry)}
                        disabled={opening === entry.local_cache_key}
                      >
                        {opening === entry.local_cache_key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "فتح"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeEntry(entry)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
