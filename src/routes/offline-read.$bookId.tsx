import { createFileRoute } from "@tanstack/react-router";
import { OfflineReader } from "@/components/OfflineReader";

export const Route = createFileRoute("/offline-read/$bookId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "قراءة دون اتصال — SyncRead" },
      { name: "description", content: "قارئ PDF محلي يعمل من النسخة المحفوظة على الجهاز." },
    ],
  }),
  component: OfflineReadRoute,
});

function OfflineReadRoute() {
  const { bookId } = Route.useParams();
  return <OfflineReader bookId={bookId} />;
}
