import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, HelpCircle, Calculator, Building2 } from "lucide-react";
import { view } from "@/lib/api";
import { getDepartment, setDepartment } from "@/lib/client";
import { configured } from "@/lib/supabase";

type Item = { type: "policy" | "faq" | "rule"; title: string; sub: string; go: string };

const RULE_ITEMS: Item[] = [
  { type: "rule", title: "PL encashment & 63-day cap", sub: "PL & Gratuity calculator", go: "/pl-gratuity" },
  { type: "rule", title: "Gratuity formula and eligibility", sub: "PL & Gratuity calculator", go: "/pl-gratuity" },
  { type: "rule", title: "Income tax: old vs new regime", sub: "Income Tax calculator", go: "/income-tax" },
  { type: "rule", title: "Provident Fund contributions", sub: "PF calculator", go: "/pf" },
];

export function EmployeeTopBar() {
  const [dept, setDept] = useState(getDepartment() ?? "");
  const [depts, setDepts] = useState<string[]>([]);
  useEffect(() => { if (configured) view<{ key: string; value: any }>("public_settings", (q) => q.eq("key", "departments")).then((r) => setDepts(r[0]?.value ?? [])).catch(() => {}); }, []);
  return (
    <>
      <div className="flex-1 min-w-0"><GlobalSearch /></div>
      {depts.length > 0 && (
        <label className="hidden md:flex items-center gap-1.5 text-xs text-navy-3">
          <Building2 className="h-4 w-4" />
          <select aria-label="Your department" value={dept} onChange={(e) => { setDept(e.target.value); setDepartment(e.target.value); }} className="bg-transparent font-semibold text-navy outline-none">
            <option value="">Department</option>{depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

export function GlobalSearch() {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const nav = useNavigate(); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!configured || !open || items.length) return;
    Promise.all([view<any>("public_policies"), view<any>("public_faqs")]).then(([p, f]) => setItems([
      ...p.map((x) => ({ type: "policy" as const, title: x.name, sub: `${x.category} policy · ${x.description ?? ""}`, go: `/policy/${x.id}` })),
      ...f.map((x) => ({ type: "faq" as const, title: x.question, sub: `${x.policy_name}: ${x.short_answer ?? ""}`, go: `/policy/${x.policy_id}?faq=${x.id}` })),
      ...RULE_ITEMS,
    ])).catch(() => {});
  }, [open, items.length]);
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const words = t.split(/\s+/);
    return items.map((i) => ({ i, s: words.filter((w) => (i.title + " " + i.sub).toLowerCase().includes(w)).length + (i.title.toLowerCase().includes(t) ? 2 : 0) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.i);
  }, [q, items]);
  const Icon = { policy: FileText, faq: HelpCircle, rule: Calculator };
  return (
    <div ref={box} className="relative w-full">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { setOpen(false); nav(`/ask?q=${encodeURIComponent(q.trim())}`); } }}
        placeholder="Search policies & questions..." aria-label="Search"
        className="w-full h-9 rounded-lg bg-white border border-slate-200 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 mt-2 w-[min(92vw,520px)] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
          {results.map((r, k) => { const I = Icon[r.type]; return (
            <button key={k} onClick={() => { setOpen(false); setQ(""); nav(r.go); }} className="w-full text-left flex gap-3 px-4 py-2.5 hover:bg-slate-50">
              <I className="h-4 w-4 mt-0.5 text-brand shrink-0" /><span className="min-w-0"><span className="block text-sm font-semibold truncate">{r.title}</span><span className="block text-xs text-navy-3 truncate">{r.sub}</span></span>
            </button>); })}
          <button onClick={() => { setOpen(false); nav(`/ask?q=${encodeURIComponent(q.trim())}`); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-brand-dark bg-brand-soft hover:bg-brand-line/50">
            Ask PeopleHub AI: “{q.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
