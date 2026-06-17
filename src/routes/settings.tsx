import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CloudOff,
  Info,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Sun,
  Trash2,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  releaseKeepAwake,
  requestKeepAwake,
  saveSettings,
  subscribeSettings,
} from "@/lib/settings";
import {
  clearAllCachedPdfs,
  countCachedPdfs,
  flushProgressQueue,
  getCacheBytesEstimate,
  getLastSyncIso,
  getPendingQueueCount,
} from "@/lib/library";
import { getUserId, getUserName, setUserName } from "@/lib/sync-read";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — SyncRead" },
      { name: "description", content: "خصّص المظهر والقراءة والإشعارات والعمل دون اتصال." },
    ],
  }),
  component: SettingsPage,
});

const APP_VERSION = "1.0.0";

function formatBytes(b: number): string {
  if (!b) return "0 KB";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${u[i]}`;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [name, setName] = useState<string>(() => getUserName());
  const [cacheBytes, setCacheBytes] = useState(0);
  const [bookCount, setBookCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(() => getLastSyncIso());
  const [syncing, setSyncing] = useState(false);
  const userId = typeof window !== "undefined" ? getUserId() : "";

  useEffect(() => subscribeSettings(setSettings), []);

  const refreshCacheStats = async () => {
    const [bytes, count] = await Promise.all([getCacheBytesEstimate(), countCachedPdfs()]);
    setCacheBytes(bytes);
    setBookCount(count);
    setPending(getPendingQueueCount());
    setLastSync(getLastSyncIso());
  };

  useEffect(() => {
    void refreshCacheStats();
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    saveSettings(next);
  };

  const handleKeepAwake = async (v: boolean) => {
    update("keepAwake", v);
    if (v) {
      const ok = await requestKeepAwake();
      if (!ok) toast.warning("متصفحك لا يدعم منع إطفاء الشاشة");
    } else {
      await releaseKeepAwake();
    }
  };

  const handleClearCache = async () => {
    if (!confirm("سيتم حذف جميع الكتب المخزّنة للقراءة دون اتصال. هل أنت متأكد؟")) return;
    await clearAllCachedPdfs(userId);
    toast.success("تم مسح الكتب المخزّنة");
    await refreshCacheStats();
  };

  const handleSyncNow = async () => {
    if (!navigator.onLine) {
      toast.error("أنت غير متصل");
      return;
    }
    setSyncing(true);
    try {
      await flushProgressQueue();
      toast.success("تمت المزامنة");
    } catch {
      toast.error("فشلت المزامنة");
    } finally {
      setSyncing(false);
      await refreshCacheStats();
    }
  };

  const handleLogout = () => {
    if (!confirm("سيتم حذف بياناتك المحلية من هذا الجهاز.")) return;
    try {
      localStorage.removeItem("syncread_user_id");
      localStorage.removeItem("syncread_user_name");
    } catch {
      // ignore
    }
    toast.success("تم تسجيل الخروج");
    navigate({ to: "/" });
  };

  const resetDefaults = () => {
    saveSettings(DEFAULT_SETTINGS);
    toast.success("تمت استعادة الإعدادات الافتراضية");
  };

  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" />
          العودة
        </Link>
        <h1 className="text-2xl font-black">الإعدادات</h1>
        <div className="w-12" />
      </header>

      <div className="space-y-4">
        {/* Appearance */}
        <Section icon={<Palette className="h-5 w-5" />} title="المظهر">
          <Row label="السمة" description="فاتح، داكن، أو حسب النظام">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              {(
                [
                  { v: "light", icon: Sun, label: "فاتح" },
                  { v: "dark", icon: Moon, label: "داكن" },
                  { v: "system", icon: Monitor, label: "النظام" },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = settings.theme === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => update("theme", opt.v)}
                    aria-pressed={active}
                    aria-label={opt.label}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Row>
        </Section>

        {/* Reading */}
        <Section icon={<BookOpen className="h-5 w-5" />} title="القراءة">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">حجم الخط</Label>
              <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
            </div>
            <Slider
              min={12}
              max={24}
              step={1}
              value={[settings.fontSize]}
              onValueChange={(v) => update("fontSize", v[0])}
              dir="ltr"
            />
          </div>
          <Row label="انتقالات الصفحات" description="تأثير حركي عند تغيير الصفحة">
            <Switch
              checked={settings.pageTransitions}
              onCheckedChange={(v) => update("pageTransitions", v)}
            />
          </Row>
          <Row label="إبقاء الشاشة قيد التشغيل" description="أثناء القراءة فقط">
            <Switch checked={settings.keepAwake} onCheckedChange={handleKeepAwake} />
          </Row>
          <Row label="اتجاه القراءة" description="من اليمين أو من اليسار">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              {(["rtl", "ltr"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => update("direction", v)}
                  aria-pressed={settings.direction === v}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    settings.direction === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {v === "rtl" ? "RTL" : "LTR"}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Notifications */}
        <Section icon={<Bell className="h-5 w-5" />} title="الإشعارات">
          <Row label="إشعارات الجلسات">
            <Switch
              checked={settings.notifySession}
              onCheckedChange={(v) => update("notifySession", v)}
            />
          </Row>
          <Row label="نقاشات جديدة">
            <Switch
              checked={settings.notifyDiscussion}
              onCheckedChange={(v) => update("notifyDiscussion", v)}
            />
          </Row>
          <Row label="أفكار جديدة">
            <Switch
              checked={settings.notifyIdea}
              onCheckedChange={(v) => update("notifyIdea", v)}
            />
          </Row>
        </Section>

        {/* Offline */}
        <Section icon={<CloudOff className="h-5 w-5" />} title="العمل دون اتصال">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">حجم الذاكرة المؤقتة</div>
              <div className="font-bold text-lg mt-1">{formatBytes(cacheBytes)}</div>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">كتب مخزّنة</div>
              <div className="font-bold text-lg mt-1">{bookCount}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>تغييرات معلّقة: {pending}</span>
            <span>
              آخر مزامنة: {lastSync ? new Date(lastSync).toLocaleString("ar") : "لا توجد"}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSyncNow} disabled={syncing} variant="outline" className="flex-1">
              <RefreshCw className={`h-4 w-4 ml-1.5 ${syncing ? "animate-spin" : ""}`} />
              مزامنة الآن
            </Button>
            <Button
              onClick={handleClearCache}
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 ml-1.5" />
              مسح الكتب المخزّنة
            </Button>
          </div>
        </Section>

        {/* Account */}
        <Section icon={<User className="h-5 w-5" />} title="الحساب">
          <div>
            <Label htmlFor="displayName" className="mb-2 block text-sm">
              الاسم الظاهر
            </Label>
            <div className="flex gap-2">
              <Input
                id="displayName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك"
                maxLength={40}
              />
              <Button
                onClick={() => {
                  const t = name.trim();
                  if (!t) return toast.error("الاسم لا يمكن أن يكون فارغاً");
                  setUserName(t);
                  toast.success("تم الحفظ");
                }}
              >
                حفظ
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2 break-all">
              مُعرّفك: <span className="font-mono">{userId.slice(0, 8)}…</span>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
          >
            <LogOut className="h-4 w-4 ml-1.5" />
            تسجيل الخروج وحذف بيانات هذا الجهاز
          </Button>
        </Section>

        {/* About */}
        <Section icon={<Info className="h-5 w-5" />} title="حول التطبيق">
          <Row label="الإصدار">
            <span className="text-sm font-mono text-muted-foreground">v{APP_VERSION}</span>
          </Row>
          <div className="flex gap-2 text-sm">
            <Link
              to="/privacy"
              className="flex-1 rounded-lg border bg-card hover:bg-muted px-3 py-2 text-center transition-colors"
            >
              سياسة الخصوصية
            </Link>
            <Link
              to="/terms"
              className="flex-1 rounded-lg border bg-card hover:bg-muted px-3 py-2 text-center transition-colors"
            >
              شروط الاستخدام
            </Link>
          </div>
          <button
            onClick={resetDefaults}
            className="w-full text-xs text-muted-foreground hover:text-foreground pt-2"
          >
            استعادة الإعدادات الافتراضية
          </button>
        </Section>
      </div>
    </main>
  );
}
