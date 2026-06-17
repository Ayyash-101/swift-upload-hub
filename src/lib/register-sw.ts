// Guarded service-worker registration. Registers only in production on the
// real published origin — never in dev, iframe previews, or Lovable preview hosts.

const SW_PATH = "/sw.js";

function shouldRegister(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;

  // Inside an iframe (Lovable editor preview)
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }

  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return false;
  }

  if (new URL(window.location.href).searchParams.get("sw") === "off") return false;

  return true;
}

async function unregisterMatching() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return url.endsWith(SW_PATH);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    // ignore
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!shouldRegister()) {
    void unregisterMatching();
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_PATH, { scope: "/" }).catch((err) => {
      console.warn("[sw] registration failed", err);
    });
  });
}
