import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

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

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[60] bg-amber-500/95 text-amber-950 text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 shadow"
      dir="rtl"
    >
      <WifiOff className="h-4 w-4" />
      أنت غير متصل بالإنترنت — يتم استخدام النسخة المحفوظة محلياً
    </div>
  );
}
