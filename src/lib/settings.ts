// User settings — stored locally, applied instantly, broadcast to subscribers.

export type ThemeMode = "light" | "dark" | "system";
export type ReadingDirection = "rtl" | "ltr";

export type AppSettings = {
  // Appearance
  theme: ThemeMode;
  // Reading
  fontSize: number; // px base for body
  pageTransitions: boolean;
  keepAwake: boolean;
  direction: ReadingDirection;
  // Notifications
  notifySession: boolean;
  notifyDiscussion: boolean;
  notifyIdea: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  fontSize: 16,
  pageTransitions: true,
  keepAwake: false,
  direction: "rtl",
  notifySession: true,
  notifyDiscussion: true,
  notifyIdea: true,
};

const KEY = "syncread_settings";

export function loadSettings(): AppSettings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const listeners = new Set<(s: AppSettings) => void>();

export function saveSettings(next: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  applySettings(next);
  listeners.forEach((l) => l(next));
}

export function subscribeSettings(fn: (s: AppSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function applySettings(s: AppSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Theme
  const theme = resolveTheme(s.theme);
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  // Direction
  root.dir = s.direction;
  // Font size (base)
  root.style.fontSize = `${s.fontSize}px`;
  // Page transitions flag (consumable via CSS / data attr)
  root.dataset.transitions = s.pageTransitions ? "on" : "off";
}

let systemThemeMql: MediaQueryList | null = null;
let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function initSettings() {
  if (typeof window === "undefined") return;
  const s = loadSettings();
  applySettings(s);
  // React to OS theme changes when in system mode.
  systemThemeMql = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeHandler = () => {
    const cur = loadSettings();
    if (cur.theme === "system") applySettings(cur);
  };
  systemThemeMql.addEventListener("change", systemThemeHandler);
}

// ---------- Wake Lock helper ----------
type WakeLockSentinel = { release: () => Promise<void> };
let wakeLock: WakeLockSentinel | null = null;

export async function requestKeepAwake(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return false;
    wakeLock = await nav.wakeLock.request("screen");
    return true;
  } catch {
    return false;
  }
}

export async function releaseKeepAwake() {
  try {
    await wakeLock?.release();
  } catch {
    // ignore
  }
  wakeLock = null;
}
