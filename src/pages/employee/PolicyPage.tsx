import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, ChevronDown, MessageSquareText, Phone } from "lucide-react";
import { Card, Empty, Skeleton } from "@/components/ui";
import { Md } from "@/components/Shared";
import { employeeApi, view } from "@/lib/api";
import { policyColor, versionOf } from "@/lib/policyColors";
import { fmtDate } from "@/lib/format";

export default function PolicyPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const faqId = params.get("faq");
  const [policy, setPolicy] = useState<any | null | undefined>(undefined);
  const [faqs, setFaqs] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState("");
  const [openId, setOpenId] = useState<string | null>(faqId);
  const [more, setMore] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPolicy(undefined); setFaqs(null);
    view("public_policies", (x) => x.eq("id", id)).then((r) => setPolicy(r[0] ?? null)).catch(() => setPolicy(null));
    view("public_faqs", (x) => x.eq("policy_id", id).order("view_count", { ascending: false })).then(setFaqs).catch(() => setFaqs([]));
  }, [id]);

  const c = policyColor(policy?.name);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (faqs ?? []).filter((f) => !t || `${f.question} ${f.short_answer ?? ""}`.toLowerCase().includes(t));
  }, [faqs, q]);

  const toggle = (f: any) => {
    const open = openId === f.id; setOpenId(open ? null : f.id);
    if (!open) employeeApi("faq_view", { faq_id: f.id }).catch(() => {});
  };
  const submitAsk = (e: React.FormEvent) => { e.preventDefault(); if (ask.trim()) nav(`/ask?policy=${id}&policyName=${encodeURIComponent(policy.name)}&q=${encodeURIComponent(ask.trim())}`); };

  if (policy === undefined) return <Skeleton className="h-96" />;
  if (policy === null) return <Card><Empty title="Policy not found" text="This policy is not available right now. It may have been updated or deactivated." action={<Link to="/" className="text-brand-dark font-semibold text-sm">Back to home</Link>} /></Card>;

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      <section className="rounded-2xl p-5 text-white" style={{ background: c.main }}>
        <p className="text-xs font-semibold text-white/80">{policy.category}</p>
        <h1 className="text-2xl font-extrabold mt-0.5">{policy.name}</h1>
        <p className="text-xs text-white/85 mt-1.5">{versionOf(policy)} · Last updated {fmtDate(policy.published_at)}{policy.effective_date ? ` · Effective ${fmtDate(policy.effective_date)}` : ""} · {policy.faq_count} questions</p>
        {policy.description && <p className="text-sm text-white/95 mt-2 max-w-2xl">{policy.description}</p>}
      </section>

      <Card className="p-4">
        <p className="font-bold text-sm mb-2">Ask your own question about this policy</p>
        <form onSubmit={submitAsk} className="flex gap-2">
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Type your question about ${policy.name}`} aria-label="Ask a question about this policy"
            className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2" style={{ outlineColor: c.main }} />
          <button type="submit" disabled={!ask.trim()} className="h-10 px-5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-1.5" style={{ background: c.main }}><MessageSquareText className="h-4 w-4" />Ask</button>
        </form>
      </Card>

      <p className="font-bold">Questions &amp; answers{faqs ? ` (${faqs.length})` : ""}</p>

      <>
        <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the questions in this policy" aria-label="Search questions"
          className="w-full h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand" /></div>
        {faqs === null ? <Skeleton className="h-64" /> : list.length === 0 ? <Card><Empty title={faqs.length ? "No question matches your search" : "No questions published for this policy yet"} text="You can type your own question in the box above." /></Card> : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {list.map((f, i) => (
              <div key={f.id}>
                <button onClick={() => toggle(f)} className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50" aria-expanded={openId === f.id}>
                  <span className="h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5" style={{ background: c.soft, color: c.dark }}>{i + 1}</span>
                  <span className="flex-1 font-semibold text-[15px]">{f.question}</span>
                  <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${openId === f.id ? "rotate-180" : ""}`} />
                </button>
                {openId === f.id && (
                  <div className="px-4 pb-4 pl-[52px]">
                    <div className="rounded-xl p-3.5 text-[15px]" style={{ background: c.soft }}><Md>{f.short_answer ?? f.detailed_answer ?? ""}</Md></div>
                    {f.detailed_answer && f.short_answer && f.detailed_answer !== f.short_answer && (
                      <>
                        <button onClick={() => setMore({ ...more, [f.id]: !more[f.id] })} className="text-xs font-semibold mt-2" style={{ color: c.dark }}>{more[f.id] ? "Hide details" : "Show more details"}</button>
                        {more[f.id] && <div className="mt-2 text-sm"><Md>{f.detailed_answer}</Md></div>}
                      </>
                    )}
                    {f.section && <p className="text-xs text-navy-3 mt-2">Source: {policy.name}, {f.section}</p>}
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
        <p className="text-sm text-navy-3 flex items-center gap-2"><Phone className="h-4 w-4" />Not satisfied with an answer? <Link to={`/contact?topic=${encodeURIComponent(policy.name)}`} className="font-semibold text-brand-dark">Contact HR</Link></p>
      </>
    </div>
  );
}
