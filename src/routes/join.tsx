import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpenText, LogIn, Loader2, ArrowLeft } from "lucide-react";
import { getUserId, getUserName, setUserName } from "@/lib/sync-read";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "انضمام لجلسة قراءة — SyncRead" },
      { name: "description", content: "أدخل اسمك ورمز الجلسة للانضمام فورًا." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialCode = (search?.get("code") ?? "").toUpperCase();

  const [name, setName] = useState<string>(() => getUserName());
  const [code, setCode] = useState<string>(initialCode);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();

    if (!trimmedName) {
      toast.error("الرجاء إدخال اسمك");
      return;
    }
    if (trimmedCode.length < 4) {
      toast.error("الرجاء إدخال رمز الجلسة");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("أنت غير متصل — افتح الكتب المحفوظة من مكتبتي");
      navigate({ to: "/library" });
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      setUserName(trimmedName);
      const userId = getUserId();

      const { data: session, error } = await supabase
        .from("sessions")
        .select("id, code")
        .eq("code", trimmedCode)
        .maybeSingle();

      if (error) throw error;
      if (!session) {
        toast.error("الجلسة غير موجودة. تحقق من الرمز.");
        return;
      }

      const { error: joinError } = await supabase.rpc("upsert_participant", {
        p_session_id: session.id,
        p_user_id: userId,
        p_name: trimmedName,
        p_current_page: 1,
      });
      if (joinError) throw joinError;

      toast.success("تم الانضمام للجلسة");
      navigate({ to: "/session/$code", params: { code: session.code } });
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "تعذّر الانضمام للجلسة");
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
          <h1 className="text-3xl font-black tracking-tight">انضمام لجلسة قراءة</h1>
          <p className="text-muted-foreground mt-2">
            أدخل اسمك ورمز الجلسة للانضمام فورًا. لا حاجة لحساب.
          </p>
        </div>

        <Card className="p-6 shadow-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) handleJoin();
            }}
            className="space-y-5"
          >
            <div>
              <Label htmlFor="name" className="mb-2 block">
                الاسم المعروض
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: أحمد"
                maxLength={40}
                autoFocus={!name}
                required
              />
            </div>

            <div>
              <Label htmlFor="code" className="mb-2 block">
                رمز الجلسة
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="text-center tracking-[0.4em] font-bold text-lg"
                autoFocus={!!name && !initialCode}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 ml-1.5" />
                  انضمام للجلسة
                </>
              )}
            </Button>
          </form>
        </Card>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
