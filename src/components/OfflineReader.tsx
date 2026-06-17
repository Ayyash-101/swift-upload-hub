"use client";

import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfViewer } from "@/components/PdfViewer";
import { getUserId } from "@/lib/sync-read";
import {
  cacheKeyFromOfflineBookId,
  getCachedPdfData,
  getCachedPdfInfo,
  getLocalLibrary,
  upsertLocalLibrary,
  type LibraryEntry,
} from "@/lib/library";

interface OfflineReaderProps {
  bookId: string;
}

export function OfflineReader({ bookId }: OfflineReaderProps) {
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const cacheKey = cacheKeyFromOfflineBookId(bookId);
      const userId = getUserId();
      const local = getLocalLibrary(userId).find((item) => item.local_cache_key === cacheKey);
      const info = await getCachedPdfInfo(cacheKey);
      const data = info.exists && info.looksLikePdf ? await getCachedPdfData(cacheKey) : null;

      if (!active) return;
      if (!local || !data) {
        setMissing(true);
        setLoading(false);
        return;
      }

      const restoredPage = Math.max(1, local.last_page || 1);
      const updated = { ...local, last_page: restoredPage, last_opened: new Date().toISOString() };
      upsertLocalLibrary(updated);
      setEntry(updated);
      setPdfData(data);
      setPage(restoredPage);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [bookId]);

  const setReaderPage = (nextPage: number) => {
    if (!entry) return;
    const max = entry.total_pages > 0 ? entry.total_pages : Number.MAX_SAFE_INTEGER;
    const safePage = Math.max(1, Math.min(nextPage, max));
    const updated = { ...entry, last_page: safePage, last_opened: new Date().toISOString() };
    upsertLocalLibrary(updated);
    setEntry(updated);
    setPage(safePage);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (missing || !entry || !pdfData) {
    return (
      <main className="min-h-screen flex flex-col" dir="rtl">
        <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/library" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="font-bold">وضع القراءة دون اتصال</h1>
          </div>
        </header>
        <div className="flex-1 max-w-md w-full mx-auto px-4 py-10">
          <Card className="p-8 text-center">
            <WifiOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="font-bold mb-1">الملف غير متوفر محلياً</h2>
            <p className="text-muted-foreground text-sm mb-5">
              افتح هذا الكتاب مرة واحدة عبر الإنترنت ليتم حفظه كاملاً على الجهاز.
            </p>
            <Button asChild>
              <Link to="/library">العودة للمكتبة</Link>
            </Button>
          </Card>
        </div>
      </main>
    );
  }

  const max = entry.total_pages > 0 ? entry.total_pages : Number.MAX_SAFE_INTEGER;

  return (
    <main className="min-h-screen flex flex-col" dir="rtl">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/library" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold truncate">{entry.title}</h1>
            <p className="text-xs text-muted-foreground">وضع القراءة دون اتصال — IndexedDB</p>
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <WifiOff className="h-3.5 w-3.5" />
            محلي بالكامل
          </span>
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
              upsertLocalLibrary(updated);
              setEntry(updated);
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
            onClick={() => setReaderPage(page - 1)}
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
            onClick={() => setReaderPage(page + 1)}
            aria-label="التالي"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </main>
  );
}
