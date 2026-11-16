import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Card, Field, Input, Notice, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { useAdmin, run } from "./common";

export default function Settings() {
  const { data, loading, reload } = useAdmin<{ settings: any[] }>("list_settings");
  const get = (k: string) => data?.settings.find((s) => s.key === k)?.value;
  const [th, setTh] = useState({ high: "", medium: "" });
  const [depts, setDepts] = useState("");
  const [fallback, setFallback] = useState("");
  useEffect(() => {
    if (!data) return;
    const t = get("confidence_thresholds") ?? {}; setTh({ high: String(t.high ?? 0.55), medium: String(t.medium ?? 0.4) });
    setDepts((get("departments") ?? []).join("\n")); setFallback(get("app")?.fallback_message ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  if (loading && !data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title="Settings" />
      <Card className="p-5 space-y-3">
        <p className="font-bold">Answer confidence</p>
        <p className="text-sm text-navy-3">Similarity scores (0 to 1) between a question and the best matching policy text. Below “medium”, the assistant says it couldn't find reliable information and shows a contact.</p>
        <div className="grid grid-cols-2 gap-3"><Field label="High confidence from"><Input value={th.high} onChange={(e) => setTh({ ...th, high: e.target.value })} /></Field><Field label="Medium confidence from"><Input value={th.medium} onChange={(e) => setTh({ ...th, medium: e.target.value })} /></Field></div>
        <Button onClick={async () => { const h = Number(th.high), m = Number(th.medium); if (!(h > m && m > 0 && h < 1)) return toast.error("High must be greater than medium, both between 0 and 1."); await run("set_setting", { key: "confidence_thresholds", value: { high: h, medium: m }, is_public: false }, "Thresholds saved"); reload(); }}>Save thresholds</Button>
      </Card>
      <Card className="p-5 space-y-3">
        <p className="font-bold">Departments</p><p className="text-sm text-navy-3">Employees can pick their department in the top bar. Used only for department-wise analytics.</p>
        <Textarea value={depts} onChange={(e) => setDepts(e.target.value)} className="min-h-[140px]" />
        <Button onClick={async () => { await run("set_setting", { key: "departments", value: depts.split("\n").map((s) => s.trim()).filter(Boolean), is_public: true }, "Departments saved"); reload(); }}>Save departments</Button>
      </Card>
      <Card className="p-5 space-y-3">
        <p className="font-bold">Fallback message</p>
        <Field label="Shown above the contact card"><Input value={fallback} onChange={(e) => setFallback(e.target.value)} /></Field>
        <Button onClick={async () => { await run("set_setting", { key: "app", value: { ...(get("app") ?? {}), fallback_message: fallback }, is_public: true }, "Saved"); reload(); }}>Save message</Button>
      </Card>
      <Notice tone="blue">Admin access is controlled on the server with <code>ADMIN_ALLOWED_IPS</code> or <code>ADMIN_PROXY_TOKEN</code> on the <code>admin</code> Edge Function. AI keys live only in Edge Function secrets.</Notice>
    </div>
  );
}
