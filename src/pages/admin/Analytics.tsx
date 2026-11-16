import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { Download } from "lucide-react";
import { Button, Card, Empty, PageHeader, Skeleton, Stat, Badge } from "@/components/ui";
import { useAdmin, DateFilter, rangeToPayload, type Range, CHART } from "./common";

export default function Analytics() {
  const [range, setRange] = useState<Range>({ preset: "30" });
  const { data: d, loading } = useAdmin<any>("analytics", rangeToPayload(range));
  const exportGaps = () => {
    if (!d) return;
    const csv = ["Topic,Distinct questions,Total asks", ...d.knowledge_gaps.map((g: any) => `"${g.topic.replace(/"/g, '""')}",${g.questions},${g.asks}`), "", "Question,Times asked", ...d.top_gaps.map((g: any) => `"${g.question.replace(/"/g, '""')}",${g.ask_count}`)].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "knowledge-gap-report.csv"; a.click();
  };
  const bars = (data: any[], key = "value", name = "name", h = 240) => data?.length ? <div style={{ height: h }}><ResponsiveContainer><BarChart data={data} layout="vertical" margin={{ left: 8 }}><XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey={name} width={140} fontSize={11} /><Tooltip /><Bar dataKey={key} fill={CHART.orange} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <Empty title="No data in this period" />;
  return (
    <div>
      <PageHeader title="Query Analytics" text="How employees use PeopleHub. Individual conversations are not shown here; question text appears only in aggregate." actions={<DateFilter value={range} onChange={setRange} />} />
      {loading && !d ? <Skeleton className="h-96" /> : d && <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Employee queries" value={d.total_queries} />
          <Stat label="Answered from policy" value={d.confidence.high} tone="orange" />
          <Stat label="Closest-match answers" value={d.confidence.medium} />
          <Stat label="Low confidence" value={d.confidence.low} tone={d.confidence.low ? "red" : undefined} />
          <Stat label="Helpful feedback" value={`${d.feedback.helpful}/${d.feedback.helpful + d.feedback.not_helpful}`} />
        </div>
        <Card className="p-5"><p className="font-bold mb-3">Answer confidence by day</p>
          {d.per_day.length ? <div className="h-64"><ResponsiveContainer><BarChart data={d.per_day}><CartesianGrid stroke="#eef0f3" vertical={false} /><XAxis dataKey="day" fontSize={11} tickFormatter={(x) => x.slice(5)} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend /><Bar stackId="a" dataKey="high" name="High" fill={CHART.navy} /><Bar stackId="a" dataKey="medium" name="Medium" fill={CHART.amber} /><Bar stackId="a" dataKey="low" name="Low" fill={CHART.orange} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty title="No questions in this period" />}
        </Card>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5"><p className="font-bold mb-3">Most asked questions</p>
            {d.top_questions.length ? d.top_questions.map((q: any, i: number) => <div key={i} className="flex justify-between gap-3 text-sm py-1.5 border-t border-slate-100"><span className="line-clamp-1">{q.question}</span><b>{q.count}</b></div>) : <Empty title="No questions yet" />}</Card>
          <Card className="p-5"><p className="font-bold mb-3">Most viewed policies</p>{bars(d.most_viewed_policies)}</Card>
          <Card className="p-5"><p className="font-bold mb-3">Department-wise queries</p>{bars(d.departments)}</Card>
          <Card className="p-5"><p className="font-bold mb-3">Calculator and email usage</p>
            <div className="grid grid-cols-2 gap-2">
              {[["Calculators", d.calculators], ["Email drafts", d.emails]].map(([l, data]: any) => <div key={l}><p className="text-xs text-navy-3 mb-1">{l}</p>{data.length ? <div className="h-44"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" outerRadius={60}>{data.map((_: any, i: number) => <Cell key={i} fill={CHART.palette[i % 8]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div> : <p className="text-sm text-navy-3">No usage</p>}</div>)}
            </div></Card>
        </div>
        <Card className="p-5">
          <div className="flex justify-between items-center mb-3"><div><p className="font-bold">Knowledge-gap report</p><p className="text-sm text-navy-3">Topics where employees asked questions the policies don't answer well. Open items only.</p></div><Button variant="secondary" onClick={exportGaps}><Download className="h-4 w-4" />Export CSV</Button></div>
          {d.knowledge_gaps.length ? <div className="grid lg:grid-cols-2 gap-6">
            {bars(d.knowledge_gaps, "asks", "topic", 260)}
            <div>{d.top_gaps.map((g: any) => <div key={g.question} className="flex justify-between gap-3 text-sm py-1.5 border-t border-slate-100"><span className="line-clamp-1">{g.question}</span><Badge tone="orange">{g.ask_count}×</Badge></div>)}</div>
          </div> : <Empty title="No open knowledge gaps" />}
        </Card>
      </div>}
    </div>
  );
}
