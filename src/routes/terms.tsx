import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شروط الاستخدام — SyncRead" },
      { name: "description", content: "شروط استخدام تطبيق SyncRead." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للإعدادات
      </Link>
      <h1 className="text-3xl font-black mb-4">شروط الاستخدام</h1>
      <div className="prose prose-sm max-w-none space-y-3 text-foreground">
        <p>
          باستخدامك تطبيق SyncRead فإنك توافق على هذه الشروط. الخدمة مقدّمة "كما هي" دون أي ضمانات
          صريحة أو ضمنية.
        </p>
        <h2 className="text-lg font-bold mt-4">المحتوى</h2>
        <p>
          أنت مسؤول عن أي محتوى ترفعه أو تشاركه. لا تشارك مواد تنتهك حقوق الملكية الفكرية أو
          القوانين المعمول بها.
        </p>
        <h2 className="text-lg font-bold mt-4">إساءة الاستخدام</h2>
        <p>يُمنع استخدام التطبيق لأي نشاط ضار، أو محاولة الوصول غير المصرح به إلى جلسات الآخرين.</p>
      </div>
    </main>
  );
}
