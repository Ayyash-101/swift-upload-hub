import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpenText,
  Users,
  Plus,
  LogIn,
  Loader2,
  Library,
  Activity,
  Settings as SettingsIcon,
} from "lucide-react";
import { generateSessionCode, getUserId, getUserName, setUserName } from "@/lib/sync-read";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InstallPwa } from "@/components/InstallPwa";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SyncRead — قراءة جماعية متزامنة" },
      { name: "description", content: "أنشئ جلسة قراءة أو انضم بكود الجلسة." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>(() => getUserName());
  const [bookName, setBookName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);

  const persistName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("الرجاء إدخال اسمك");
      return false;
    }
    setUserName(trimmed);
    return true;
  };

  const handleCreate = async () => {
    if (!persistName()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("أنت غير متصل — افتح الكتب المحفوظة من مكتبتي");
      navigate({ to: "/library" });
      return;
    }
    setLoading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const userId = getUserId();
      const code = generateSessionCode();
      const { data: session, error } = await supabase
        .from("sessions")
        .insert({
          code,
          leader_id: userId,
          book_name: bookName.trim() || "كتاب جديد",
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.rpc("upsert_participant", {
        p_session_id: session.id,
        p_user_id: userId,
        p_name: name.trim(),
        p_current_page: 1,
      });

      navigate({ to: "/session/$code", params: { code: session.code } });
    } catch (e) {
      console.error(e);
      toast.error("تعذّر إنشاء الجلسة");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!persistName()) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("أنت غير متصل — افتح الكتب المحفوظة من مكتبتي");
      navigate({ to: "/library" });
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      toast.error("أدخل رمز الجلسة");
      return;
    }
    setLoading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: session, error } = await supabase
        .from("sessions")
        .select("id, code")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      if (!session) {
        toast.error("الجلسة غير موجودة");
        return;
      }
      const userId = getUserId();
      await supabase.rpc("upsert_participant", {
        p_session_id: session.id,
        p_user_id: userId,
        p_name: name.trim(),
        p_current_page: 1,
      });
      navigate({ to: "/session/$code", params: { code: session.code } });
    } catch (e) {
      console.error(e);
      toast.error("تعذّر الانضمام للجلسة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary text-primary-foreground shadow-lg mb-4">
            <BookOpenText className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">SyncRead</h1>
          <p className="text-muted-foreground mt-2">اقرأ مع مجموعتك، صفحة واحدة، في وقت واحد.</p>
          <div className="mt-4 flex justify-center">
            <InstallPwa />
          </div>
        </div>

        <Card className="p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-5">
            <Label htmlFor="name" className="mb-2 block">
              اسمك
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد"
              maxLength={40}
            />
          </div>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="create">
                <Plus className="h-4 w-4 ml-1.5" />
                إنشاء جلسة
              </TabsTrigger>
              <TabsTrigger value="join">
                <LogIn className="h-4 w-4 ml-1.5" />
                انضمام
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-4">
              <div>
                <Label htmlFor="book" className="mb-2 block">
                  اسم الكتاب (اختياري)
                </Label>
                <Input
                  id="book"
                  value={bookName}
                  onChange={(e) => setBookName(e.target.value)}
                  placeholder="عنوان الكتاب"
                  maxLength={120}
                />
              </div>
              <Button onClick={handleCreate} disabled={loading} className="w-full" size="lg">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء جلسة قراءة"}
              </Button>
            </TabsContent>

            <TabsContent value="join" className="space-y-4">
              <div>
                <Label htmlFor="code" className="mb-2 block">
                  رمز الجلسة
                </Label>
                <Input
                  id="code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={8}
                  className="text-center tracking-[0.4em] font-bold text-lg"
                />
              </div>
              <Button onClick={handleJoin} disabled={loading} className="w-full" size="lg">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "انضمام للجلسة"}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/library"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border bg-card hover:bg-muted text-foreground transition-colors"
            >
              <Library className="h-4 w-4" />
              مكتبتي
            </Link>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border bg-card hover:bg-muted text-foreground transition-colors"
            >
              <SettingsIcon className="h-4 w-4" />
              الإعدادات
            </Link>
          </div>
          <Link
            to="/offline-status"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="h-3.5 w-3.5" />
            حالة العمل دون اتصال
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>صفحة القائد = صفحة الجميع</span>
          </div>
        </div>
      </div>
    </main>
  );
}
