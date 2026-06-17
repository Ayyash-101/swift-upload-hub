import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — SyncRead" },
      { name: "description", content: "كيف نتعامل مع بياناتك في SyncRead." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-6 max-w-2xl mx-auto">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للإعدادات
      </Link>
      <h1 className="text-3xl font-black mb-4">سياسة الخصوصية</h1>
      <div className="prose prose-sm max-w-none space-y-3 text-foreground">
        <p>
          يحترم تطبيق SyncRead خصوصيتك. لا نطلب أي معلومات شخصية للتسجيل، ويُولَّد مُعرّفٌ مجهول
          الهوية محلياً على جهازك.
        </p>
        <h2 className="text-lg font-bold mt-4">البيانات التي نخزّنها</h2>
        <ul className="list-disc pr-5 space-y-1">
          <li>الاسم الذي تختاره (محلياً على جهازك).</li>
          <li>تقدّمك في القراءة لمزامنته بين أعضاء الجلسة.</li>
          <li>روابط الكتب التي ترفعها داخل جلساتك.</li>
        </ul>
        <h2 className="text-lg font-bold mt-4">العمل دون اتصال</h2>
        <p>
          الكتب التي تُخزّنها للقراءة دون اتصال تبقى على جهازك فقط، ويمكنك حذفها في أي وقت من
          الإعدادات.
        </p>
      </div>
    </main>
  );
}
