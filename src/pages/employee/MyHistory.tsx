import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, MessageSquareText } from "lucide-react";
import { Button, Card, Confirm, Empty, PageHeader, Skeleton } from "@/components/ui";
import { employeeApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export default function MyHistory() {
  const [s, setS] = useState<any[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const load = () => employeeApi<{ sessions: any[] }>("list_sessions").then((r) => setS(r.sessions)).catch((e) => { toast.error(e.message); setS([]); });
  useEffect(() => { load(); }, []);
  return (
    <div>
      <PageHeader title="My History" text="Conversations you've had with PeopleHub AI on this device. They are not linked to your name."
        actions={s?.length ? <Button variant="danger" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete all</Button> : undefined} />
      <Card className="divide-y divide-slate-100">
        {s === null ? <div className="p-4 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : s.length === 0 ? <Empty icon={MessageSquareText} title="No conversations yet" action={<Link to="/ask"><Button>Ask a question</Button></Link>} />
          : s.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-5 py-3">
              <Link to={`/ask/${x.id}`} className="flex-1 min-w-0"><p className="font-semibold truncate">{x.title}</p><p className="text-xs text-navy-3">{fmtDateTime(x.updated_at)}</p></Link>
              <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => employeeApi("delete_session", { session_id: x.id }).then(load)}><Trash2 className="h-4 w-4" /></Button>
            </div>))}
      </Card>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title="Delete all conversations?" message="This permanently removes every conversation saved from this device." confirmLabel="Delete all" danger
        onConfirm={() => employeeApi("delete_all_sessions").then(() => { setConfirm(false); load(); toast.success("Conversations deleted"); })} />
    </div>
  );
}
