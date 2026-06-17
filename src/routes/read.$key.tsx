import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfViewer } from "@/components/PdfViewer";
import { getUserId } from "@/lib/sync-read";
import {
  getCachedPdfData,
  getLocalLibrary,
  upsertLocalLibrary,
  type LibraryEntry,
} from "@/lib/library";

export const Route = createFileRoute("/read/$key")({
  ssr: false,
  component: OfflineReadPage,
});

function OfflineReadPage() {
  const { key } = Route.useParams();
  const cacheKey = decodeURIComponent(key);
  const navigate = useNavigate();
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const userId = getUserId();
      const local = getLocalLibrary(userId).find((e) => e.local_cache_key === cacheKey);
      if (!local) {
        if (active) {
          setMissing(true);
          setLoading(false);
        }
        return;
      }
      const data = await getCachedPdfData(cacheKey);
      if (!active) return;
      if (!data) {
        setMissing(true);
        setLoading(false);
        return;
      }
      setEntry(local);
      setPdfData(data);
      setPage(Math.max(1, local.last_page));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [cacheKey]);

  // Persist progress locally on every page change; sync when online.
  useEffect(() => {
    if (!entry) return;
    const updated: LibraryEntry = {
      ...entry,
      last_page: page,
      last_opened: new Date().toISOString(),
    };
    upsertLocalLibrary(updated);
  }, [page, entry?.local_cache_key]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (missing || !pdfData || !entry) {
    return (
      <main className="min-h-screen flex flex-col">
        <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/library" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="font-bold">قراءة دون اتصال</h1>
          </div>
        </header>
        <div className="flex-1 max-w-md w-full mx-auto px-4 py-10">
          <Card className="p-8 text-center">
            <WifiOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="font-bold mb-1">الملف غير متوفر محلياً</h2>
            <p className="text-muted-foreground text-sm mb-5">
              افتح هذا الكتاب مرة واحدة عبر الإنترنت ليتم حفظه للقراءة دون اتصال.
            </p>
            <Button onClick={() => navigate({ to: "/library" })}>العودة للمكتبة</Button>
          </Card>
        </div>
      </main>
    );
  }

  const max = entry.total_pages > 0 ? entry.total_pages : Infinity;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/library" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{entry.title}</h1>
            <p className="text-xs text-muted-foreground">قراءة محلية — دون اتصال</p>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <PdfViewer
          data={pdfData}
          sourceLabel="IndexedDB"
          page={page}
          onLoadSuccess={(numPages) => {
            if (numPages !== entry.total_pages) {
              const updated = { ...entry, total_pages: numPages };
              setEntry(updated);
              upsertLocalLibrary(updated);
            }
          }}
        />
      </div>

      <footer className="sticky bottom-0 border-t bg-card/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="السابق"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="text-sm font-bold">
            صفحة {page}
            {entry.total_pages > 0 ? ` / ${entry.total_pages}` : ""}
          </div>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= max}
            onClick={() => setPage((p) => p + 1)}
            aria-label="التالي"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </main>
  );
}
