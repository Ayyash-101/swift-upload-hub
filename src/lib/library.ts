// Personal Library + Offline PDF cache (IndexedDB for blobs, localStorage for metadata).

const DB_NAME = "syncread";
const DB_VERSION = 1;
const STORE_PDFS = "pdfs";
const LIB_KEY = "syncread_library";
const PROGRESS_QUEUE_KEY = "syncread_progress_queue";
const LAST_SYNC_KEY = "syncread_last_sync";

export function getLastSyncIso(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SYNC_KEY);
}

function markSynced() {
  try {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export async function countCachedPdfs(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_PDFS, "readonly");
      const req = tx.objectStore(STORE_PDFS).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export async function getCacheBytesEstimate(): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return 0;
  try {
    const est = await navigator.storage.estimate();
    return est.usage ?? 0;
  } catch {
    return 0;
  }
}

export function getPendingQueueCount(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(PROGRESS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  }
}

export async function clearAllCachedPdfs(userId: string): Promise<void> {
  const entries = readLocalLibrary().filter((e) => e.user_id === userId);
  for (const e of entries) {
    try {
      await removeCachedPdf(e.local_cache_key);
    } catch {
      // ignore
    }
  }
}

export async function getServiceWorkerStatus(): Promise<{
  supported: boolean;
  registered: boolean;
  active: boolean;
  scope?: string;
}> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, registered: false, active: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      supported: true,
      registered: !!reg,
      active: !!reg?.active,
      scope: reg?.scope,
    };
  } catch {
    return { supported: true, registered: false, active: false };
  }
}

export type LibraryEntry = {
  id?: string;
  user_id: string;
  session_id?: string | null;
  title: string;
  pdf_url: string;
  local_cache_key: string;
  total_pages: number;
  last_page: number;
  last_opened: string; // ISO
};

// ---------- cache key ----------
export function cacheKeyFor(url: string): string {
  // Strip query (signed URLs change) — keep path so the same file matches.
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function offlineBookIdForCacheKey(cacheKey: string): string {
  const bytes = new TextEncoder().encode(cacheKey);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `b64_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

export function cacheKeyFromOfflineBookId(bookId: string): string {
  if (!bookId.startsWith("b64_")) return decodeURIComponent(bookId);
  const padded = bookId
    .slice(4)
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil((bookId.length - 4) / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------- IndexedDB ----------
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<Blob | ArrayBuffer | Uint8Array | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readonly");
    const req = tx.objectStore(STORE_PDFS).get(key);
    req.onsuccess = () =>
      resolve((req.result as Blob | ArrayBuffer | Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function toPdfBytes(
  value: Blob | ArrayBuffer | Uint8Array | null,
): Promise<Uint8Array | null> {
  if (!value) return null;
  if (value instanceof Uint8Array) return value.byteLength > 0 ? value : null;
  if (value instanceof ArrayBuffer) return value.byteLength > 0 ? new Uint8Array(value) : null;
  const buffer = await value.arrayBuffer();
  return buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readwrite");
    tx.objectStore(STORE_PDFS).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PDFS, "readwrite");
    tx.objectStore(STORE_PDFS).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- PDF cache ----------
const blobUrlCache = new Map<string, string>();

export async function getCachedBlobUrl(cacheKey: string): Promise<string | null> {
  const cached = blobUrlCache.get(cacheKey);
  if (cached) return cached;
  const value = await idbGet(cacheKey);
  const bytes = await toPdfBytes(value);
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  blobUrlCache.set(cacheKey, url);
  return url;
}

export async function getCachedPdfData(cacheKey: string): Promise<Uint8Array | null> {
  return toPdfBytes(await idbGet(cacheKey));
}

export async function getCachedPdfInfo(cacheKey: string): Promise<{
  exists: boolean;
  byteLength: number;
  looksLikePdf: boolean;
}> {
  const bytes = await getCachedPdfData(cacheKey);
  if (!bytes) return { exists: false, byteLength: 0, looksLikePdf: false };
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  return { exists: true, byteLength: bytes.byteLength, looksLikePdf: signature === "%PDF-" };
}

export async function isCached(cacheKey: string): Promise<boolean> {
  if (blobUrlCache.has(cacheKey)) return true;
  const blob = await idbGet(cacheKey);
  return !!blob;
}

export async function cachePdf(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const key = cacheKeyFor(url);
  const existing = await getCachedBlobUrl(key);
  if (existing) return existing;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);

  let blob: Blob;
  if (res.body && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    if (total > 0 && loaded !== total) {
      throw new Error(`Incomplete PDF download: ${loaded}/${total}`);
    }
    blob = new Blob(chunks as BlobPart[], { type: "application/pdf" });
  } else {
    blob = await res.blob();
  }
  if (blob.size === 0) throw new Error("Downloaded PDF is empty");

  const signature = new TextDecoder().decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (signature !== "%PDF-") throw new Error("Downloaded file is not a valid PDF");

  await idbPut(key, blob);
  const objUrl = URL.createObjectURL(blob);
  blobUrlCache.set(key, objUrl);
  return objUrl;
}

export async function removeCachedPdf(cacheKey: string): Promise<void> {
  const existing = blobUrlCache.get(cacheKey);
  if (existing) {
    URL.revokeObjectURL(existing);
    blobUrlCache.delete(cacheKey);
  }
  await idbDelete(cacheKey);
}

// ---------- Library metadata (localStorage, offline-first) ----------
function readLocalLibrary(): LibraryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LIB_KEY);
    return raw ? (JSON.parse(raw) as LibraryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLocalLibrary(entries: LibraryEntry[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(entries));
}

export function getLocalLibrary(userId: string): LibraryEntry[] {
  return readLocalLibrary()
    .filter((e) => e.user_id === userId)
    .sort((a, b) => (a.last_opened < b.last_opened ? 1 : -1));
}

export function upsertLocalLibrary(entry: LibraryEntry) {
  const all = readLocalLibrary();
  const idx = all.findIndex(
    (e) => e.user_id === entry.user_id && e.local_cache_key === entry.local_cache_key,
  );
  if (idx >= 0) all[idx] = { ...all[idx], ...entry };
  else all.push(entry);
  writeLocalLibrary(all);
}

export function removeLocalLibrary(userId: string, cacheKey: string) {
  const all = readLocalLibrary().filter(
    (e) => !(e.user_id === userId && e.local_cache_key === cacheKey),
  );
  writeLocalLibrary(all);
}

// ---------- Remote upsert (best-effort) ----------
export async function syncLibraryEntry(entry: LibraryEntry): Promise<void> {
  upsertLocalLibrary(entry);
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.rpc("upsert_library_book", {
      p_user_id: entry.user_id,
      p_session_id: (entry.session_id ?? null) as unknown as string,
      p_title: entry.title,
      p_pdf_url: entry.pdf_url,
      p_local_cache_key: entry.local_cache_key,
      p_total_pages: entry.total_pages,
      p_last_page: entry.last_page,
    });
  } catch (e) {
    console.warn("[library] remote upsert failed; will retry later", e);
  }
}

export async function fetchRemoteLibrary(userId: string): Promise<LibraryEntry[]> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("library_books")
    .select("*")
    .eq("user_id", userId)
    .order("last_opened", { ascending: false });
  if (error) {
    console.warn("[library] remote fetch failed", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    session_id: r.session_id ?? null,
    title: r.title,
    pdf_url: r.pdf_url,
    local_cache_key: r.local_cache_key,
    total_pages: r.total_pages,
    last_page: r.last_page,
    last_opened: r.last_opened,
  })) as LibraryEntry[];
}

// Merge local + remote, preferring most-recent last_opened, and persist locally.
export async function refreshLibrary(userId: string): Promise<LibraryEntry[]> {
  const local = getLocalLibrary(userId);
  if (typeof navigator !== "undefined" && !navigator.onLine) return local;

  const remote = await fetchRemoteLibrary(userId);
  const byKey = new Map<string, LibraryEntry>();
  for (const e of local) byKey.set(e.local_cache_key, e);
  for (const e of remote) {
    const existing = byKey.get(e.local_cache_key);
    if (!existing || existing.last_opened < e.last_opened) byKey.set(e.local_cache_key, e);
  }
  const merged = Array.from(byKey.values()).sort((a, b) =>
    a.last_opened < b.last_opened ? 1 : -1,
  );
  // Persist remote-only entries locally so they show up offline next time.
  for (const e of merged) upsertLocalLibrary({ ...e, user_id: userId });
  return merged;
}

// ---------- Progress sync queue ----------
type QueuedProgress = {
  session_id: string;
  user_id: string;
  current_page: number;
  reading_time_seconds: number;
  queued_at: number;
};

function readQueue(): QueuedProgress[] {
  try {
    const raw = localStorage.getItem(PROGRESS_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedProgress[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedProgress[]) {
  localStorage.setItem(PROGRESS_QUEUE_KEY, JSON.stringify(q));
}

export function queueProgress(item: Omit<QueuedProgress, "queued_at">) {
  const q = readQueue();
  // Keep only the latest entry per session.
  const filtered = q.filter(
    (i) => !(i.session_id === item.session_id && i.user_id === item.user_id),
  );
  filtered.push({ ...item, queued_at: Date.now() });
  writeQueue(filtered);
}

export async function flushProgressQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const q = readQueue();
  if (q.length === 0) return;
  const { supabase } = await import("@/integrations/supabase/client");
  const remaining: QueuedProgress[] = [];
  for (const item of q) {
    try {
      await supabase.rpc("upsert_progress", {
        p_session_id: item.session_id,
        p_user_id: item.user_id,
        p_current_page: item.current_page,
        p_reading_time_seconds: item.reading_time_seconds,
      });
    } catch (e) {
      console.warn("[library] flush progress failed; will retry", e);
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  if (remaining.length === 0) markSynced();
}

export function installOnlineSync(userId: string) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    void flushProgressQueue();
    // Re-sync any local library entries that may not have reached the server.
    const local = getLocalLibrary(userId);
    for (const e of local) void syncLibraryEntry(e);
  };
  window.addEventListener("online", handler);
  // Also try once immediately.
  if (navigator.onLine) void flushProgressQueue();
  return () => window.removeEventListener("online", handler);
}
