import { useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { Card, PageHeader, Skeleton, Stat, Badge, statusTone, Empty } from "@/components/ui";
import { useAdmin, DateFilter, rangeToPayload, type Range, CHART } from "./common";
import { fmtDate } from "@/lib/format";

export default function AdminDashboard() {
  const [range, setRange] = useState<Range>({ preset: "30" });
  const { data, loading } = useAdmin<any>("dashboard", rangeToPayload(range));
  const t = data?.totals;
  return (
    <div>
      <PageHeader title="Dashboard" text="Knowledge library health and employee questions at a glance." actions={<DateFilter value={range} onChange={setRange} />} />
      {loading && !data ? <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div> : t && <>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Total documents" value={t.documents} />
          <Stat label="Active policies" value={t.active_policies} tone="orange" />
          <Stat label="Inactive policies" value={t.inactive_policies} sub={t.draft_policies ? `${t.draft_policies} awaiting first approval` : undefined} />
          <Stat label="Published FAQs" value={t.faqs} sub={t.pending_faqs ? `${t.pending_faqs} pending review` : undefined} />
          <Stat label="Questions asked" value={t.questions} />
          <Stat label="Unanswered questions" value={t.unanswered} tone={t.unanswered ? "red" : undefined} sub="Needs review" />
          <Stat label="Low confidence answers" value={t.low_confidence} />
          <Stat label="Closest-match answers" value={t.medium_confidence} />
        </div>
        <div className="grid lg:grid-cols-3 gap-4 mt-6">
          <Card className="p-5 lg:col-span-2">
            <p className="font-bold mb-4">Questions per day</p>
            {data.per_day.length ? <div className="h-64"><ResponsiveContainer><LineChart data={data.per_day}><CartesianGrid stroke="#eef0f3" vertical={false} /><XAxis dataKey="day" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend /><Line dataKey="questions" name="Questions" stroke={CHART.navy} strokeWidth={2} dot={false} /><Line dataKey="low" name="Low confidence" stroke={CHART.orange} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
              : <Empty title="No questions in this period" />}
          </Card>
          <Card className="p-5">
            <p className="font-bold mb-4">Most asked topics</p>
            {data.top_topics.length ? <div className="h-64"><ResponsiveContainer><BarChart data={data.top_topics} layout="vertical" margin={{ left: 10 }}><XAxis type="number" hide /><YAxis type="category" dataKey="topic" width={110} fontSize={11} /><Tooltip /><Bar dataKey="count" fill={CHART.orange} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div>
              : <Empty title="No topics yet" />}
          </Card>
        </div>
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <Card className="p-5">
            <div className="flex justify-between mb-3"><p className="font-bold">Recently uploaded documents</p><Link to="/admin/documents" className="text-sm font-semibold text-brand-dark">View all</Link></div>
            {data.recent_documents.length ? data.recent_documents.map((d: any) => <div key={d.id} className="flex justify-between items-center py-2 border-t border-slate-100 text-sm"><span className="truncate pr-3">{d.file_name}</span><Badge tone={statusTone(d.status)}>{d.status.replace("_", " ")}</Badge></div>)
              : <Empty title="No documents yet" text="Upload Policy.zip to build the library." action={<Link to="/admin/documents" className="text-sm font-semibold text-brand-dark">Upload documents</Link>} />}
          </Card>
          <Card className="p-5">
            <div className="flex justify-between mb-3"><p className="font-bold">Recently updated policies</p><Link to="/admin/policies" className="text-sm font-semibold text-brand-dark">View all</Link></div>
            {data.recent_policies.length ? data.recent_policies.map((p: any) => <div key={p.id} className="flex justify-between items-center py-2 border-t border-slate-100 text-sm"><span>{p.name}<span className="text-navy-3"> · {fmtDate(p.updated_at)}</span></span><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>)
              : <Empty title="No policies yet" />}
          </Card>
        </div>
      </>}
    </div>
  );
}
