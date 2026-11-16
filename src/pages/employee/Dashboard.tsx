import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquareText, CalendarClock, Receipt, Phone, ShieldCheck, Megaphone } from "lucide-react";
import { Card, Skeleton, Badge, NotConfigured } from "@/components/ui";
import { view } from "@/lib/api";
import { configured } from "@/lib/supabase";
import { policyColor, versionOf } from "@/lib/policyColors";
import { useAdminAccess } from "@/lib/useAdminAccess";
import { fmtDate } from "@/lib/format";

type Tile = { to: string; title: string; sub: string; color: string; icon?: React.ComponentType<{ className?: string }> };

function TileCard({ t }: { t: Tile }) {
  return (
    <Link to={t.to} className="group rounded-xl bg-white border border-slate-200 border-t-[3px] p-4 min-h-[92px] flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 transition" style={{ borderTopColor: t.color }}>
      <p className="font-bold text-[15px] leading-snug flex items-start gap-2">{t.icon && <t.icon className="h-4 w-4 mt-0.5 shrink-0" />}{t.title}</p>
      <p className="text-xs text-navy-3 mt-2">{t.sub}</p>
    </Link>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const isAdmin = useAdminAccess();
  const [q, setQ] = useState("");
  const [policies, setPolicies] = useState<any[] | null>(null);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [ann, setAnn] = useState<any[]>([]);

  useEffect(() => {
    if (!configured) { setPolicies([]); return; }
    view("public_policies", (x) => x.order("name")).then(setPolicies).catch(() => setPolicies([]));
    view("public_faqs", (x) => x.order("view_count", { ascending: false }).limit(5)).then(setFaqs).catch(() => {});
    view("public_announcements", (x) => x.order("priority").order("created_at", { ascending: false }).limit(3)).then(setAnn).catch(() => {});
  }, []);
  const ask = (text: string) => text.trim() && nav(`/ask?q=${encodeURIComponent(text.trim())}`);

  const tiles: Tile[] = [
    { to: "/ask", title: "Ask HR Assistant", sub: "Ask any policy question", color: "#EA580C", icon: MessageSquareText },
    ...(policies ?? []).map((p) => ({ to: `/policy/${p.id}`, title: p.name, sub: `${p.faq_count} questions · ${versionOf(p)}`, color: policyColor(p.name).main })),
    { to: "/pl-gratuity", title: "PL & Gratuity Calculation", sub: "Estimate your PL and Gratuity", color: "#0D9488", icon: CalendarClock },
    { to: "/income-tax", title: "Income Tax Calculator", sub: "Old vs New regime", color: "#DC2626", icon: Receipt },
    { to: "/contact", title: "Contact HR", sub: "Call, email or draft an email", color: "#DB2777", icon: Phone },
    ...(isAdmin ? [{ to: "/admin", title: "Admin Dashboard", sub: "Policies, tax rules, audit log", color: "#14213D", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="space-y-5 max-w-[1020px] mx-auto">
      {!configured && <NotConfigured />}
      <section className="rounded-2xl px-6 py-5 text-white" style={{ background: "linear-gradient(100deg,#EA580C 0%,#DC2D45 55%,#BE185D 100%)" }}>
        <h1 className="text-xl sm:text-2xl font-extrabold">Hello! How can we help you today?</h1>
        <p className="text-sm text-white/90 mt-1">Ask a question, browse a policy, or calculate your tax.</p>
      </section>

      <Card className="p-4">
        <p className="font-bold text-sm mb-2">Ask your own question</p>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How many casual leaves do I get?" aria-label="Ask your own question"
            className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
          <button type="submit" disabled={!q.trim()} className="h-10 px-6 rounded-lg bg-brand text-white font-semibold text-sm hover:bg-brand-dark disabled:opacity-50">Ask</button>
        </form>
        {faqs.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {faqs.map((f) => <button key={f.id} onClick={() => ask(f.question)} className="text-xs rounded-full bg-paper border border-slate-200 px-3 py-1.5 hover:border-brand text-left">{f.question}</button>)}
          </div>
        )}
      </Card>

      {ann.length > 0 && (
        <section className="grid md:grid-cols-2 gap-3">
          {ann.map((a) => (
            <Card key={a.id} className="p-3.5 flex gap-3">
              <Megaphone className="h-5 w-5 text-brand shrink-0 mt-0.5" />
              <div><p className="font-bold text-sm">{a.title} {a.priority === "important" && <Badge tone="orange">Important</Badge>}</p><p className="text-xs text-navy-3 mt-1 whitespace-pre-wrap">{a.body}</p><p className="text-[11px] text-navy-3 mt-1.5">{fmtDate(a.starts_at ?? a.created_at)}</p></div>
            </Card>
          ))}
        </section>
      )}

      {policies === null ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)}</div>
        : <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">{tiles.map((t) => <TileCard key={t.to} t={t} />)}</section>}
      {policies?.length === 0 && configured && <p className="text-sm text-navy-3 text-center">No policies are published yet. They appear here automatically after HR uploads and approves them.</p>}
    </div>
  );
}
