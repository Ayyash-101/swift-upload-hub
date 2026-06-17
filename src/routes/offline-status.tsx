import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Activity,
  RefreshCcw,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getUserId } from "@/lib/sync-read";
import {
  countCachedPdfs,
  flushProgressQueue,
  getLastSyncIso,
  getLocalLibrary,
  getServiceWorkerStatus,
} from "@/lib/library";

export const Route = createFileRoute("/offline-status")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "حالة العمل دون اتصال — SyncRead" },
      { name: "description", content: "تشخيص حالة المكتبة والـ Service Worker والتزامن." },
    ],
  }),
  component: OfflineStatusPage,
});

type Status = {
  sw: { supported: boolean; registered: boolean; active: boolean; scope?: string };
  idbSupported: boolean;
  cachedCount: number;
  libraryCount: number;
  lastSync: string | null;
  online: boolean;
};

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-bold flex items-center gap-1.5">
        {ok === true && (
          <CheckCircle2 className="h-4 w-4 text-[var(--color-success,theme(colors.emerald.600))]" />
        )}
        {ok === false && <XCircle className="h-4 w-4 text-destructive" />}
        {value}
      </span>
    </div>
  );
}

function OfflineStatusPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const userId = getUserId();
    const [sw, cachedCount] = await Promise.all([getServiceWorkerStatus(), countCachedPdfs()]);
    const libraryCount = getLocalLibrary(userId).length;
    setStatus({
      sw,
      idbSupported: typeof indexedDB !== "undefined",
      cachedCount,
      libraryCount,
      lastSync: getLastSyncIso(),
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
    });
  };

  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      await flushProgressQueue();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col" dir="rtl">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              حالة العمل دون اتصال
            </h1>
            <p className="text-xs text-muted-foreground">تشخيص الـ PWA والتخزين والتزامن</p>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
        {!status ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">جاري الفحص…</Card>
        ) : (
          <>
            <Card className="p-4">
              <h2 className="font-bold mb-2 flex items-center gap-2">
                {status.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                الشبكة
              </h2>
              <Row label="الحالة" value={status.online ? "متصل" : "غير متصل"} ok={status.online} />
              <Row
                label="آخر مزامنة ناجحة"
                value={status.lastSync ? new Date(status.lastSync).toLocaleString("ar") : "لا يوجد"}
              />
            </Card>

            <Card className="p-4">
              <h2 className="font-bold mb-2">Service Worker</h2>
              <Row
                label="مدعوم"
                value={status.sw.supported ? "نعم" : "لا"}
                ok={status.sw.supported}
              />
              <Row
                label="مُسجَّل"
                value={status.sw.registered ? "نعم" : "لا"}
                ok={status.sw.registered}
              />
              <Row label="نشط" value={status.sw.active ? "نعم" : "لا"} ok={status.sw.active} />
              {status.sw.scope && <Row label="النطاق" value={status.sw.scope} />}
            </Card>

            <Card className="p-4">
              <h2 className="font-bold mb-2">التخزين المحلي</h2>
              <Row
                label="IndexedDB"
                value={status.idbSupported ? "متاح" : "غير متاح"}
                ok={status.idbSupported}
              />
              <Row label="كتب مُخزَّنة (PDF)" value={String(status.cachedCount)} />
              <Row label="مدخلات المكتبة" value={String(status.libraryCount)} />
            </Card>

            <div className="flex gap-2">
              <Button onClick={refresh} variant="outline" className="flex-1">
                <RefreshCcw className="h-4 w-4 ml-1.5" />
                تحديث
              </Button>
              <Button onClick={sync} disabled={busy || !status.online} className="flex-1">
                مزامنة الآن
              </Button>
            </div>

            {!status.sw.active && (
              <p className="text-xs text-muted-foreground text-center">
                لتفعيل العمل دون اتصال يجب فتح التطبيق المنشور (وليس المعاينة) مرة واحدة عبر
                الإنترنت.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
