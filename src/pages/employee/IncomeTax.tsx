import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RotateCcw, AlertTriangle, Trophy, CopyPlus, ArrowLeftToLine, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, Notice, Badge } from "@/components/ui";
import { Disclaimer } from "@/components/Shared";
import { employeeApi, view } from "@/lib/api";
import { COMPONENTS, MONTHS, computeTax, currentFY, emptyComp, spreadAnnual, type Comp, type CompKey, type TaxInput, type TaxRules } from "@/engines/tax";
import { inr, num, fmtDate, cn } from "@/lib/format";
import { downloadReport } from "@/lib/pdf";
import { getDepartment } from "@/lib/client";

type Grid = Record<CompKey, string[]>;
const blankGrid = (): Grid => Object.fromEntries(COMPONENTS.map((c) => [c.k, Array(12).fill("")])) as Grid;
const blankAnnual = () => Object.fromEntries(COMPONENTS.map((c) => [c.k, ""])) as Record<CompKey, string>;
const blankOther = { gross: "", otherIncome: "", rentAnnual: "", lta: "", childEdu: "", uniform: "", internet: "", meal: "", fuel: "", driver: "", nps1b: "",
  d80c: "", epf: "", homePrincipal: "", d80d: "", d80dParents: "", d80e: "", donation: "", homeLoanInterest: "", corpNps: "", gift: "", professionalTax: "", otherDed: "" };

/** Defined outside the page so inputs keep focus while typing. */
function Money({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return <Field label={label} hint={hint}><Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" /></Field>;
}
const cell = "h-8 w-[88px] rounded-md border border-slate-200 bg-white px-2 text-right text-xs outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
const Section = ({ n, title, note, children }: { n: string; title: string; note?: string; children: React.ReactNode }) => (
  <Card className="p-5 space-y-4">
    <div><p className="font-extrabold"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs mr-2">{n}</span>{title}</p>{note && <p className="text-xs text-navy-3 mt-1 ml-8">{note}</p>}</div>
    {children}
  </Card>
);

export default function IncomeTax() {
  const [rules, setRules] = useState<any[] | null>(null);
  const [disc, setDisc] = useState<string | null>(null);
  const [fy, setFy] = useState("");
  const [age, setAge] = useState<TaxInput["age"]>("below_60");
  const [metro, setMetro] = useState(false);
  const [parentsAge, setParentsAge] = useState<TaxInput["parentsAge"]>("below_60");
  const [mode, setMode] = useState<"annual" | "monthly">("annual");
  const [annual, setAnnual] = useState(blankAnnual());
  const [grid, setGrid] = useState<Grid>(blankGrid());
  const [rent, setRent] = useState<string[]>(Array(12).fill(""));
  const [o, setO] = useState(blankOther);

  useEffect(() => {
    view<any>("public_tax_rules", (q) => q.order("financial_year", { ascending: false })).then((r) => {
      setRules(r);
      const cur = currentFY();
      setFy(r.some((x) => x.financial_year === cur) ? cur : r[0]?.financial_year ?? "");
    }).catch(() => setRules([]));
    view<any>("public_calculator_rules", (q) => q.eq("calculator", "disclaimer_tax")).then((r) => setDisc(r[0]?.config?.text ?? null)).catch(() => {});
  }, []);

  const years = useMemo(() => [...new Set((rules ?? []).map((r) => r.financial_year))], [rules]);
  const oldR = rules?.find((r) => r.financial_year === fy && r.regime === "old");
  const newR = rules?.find((r) => r.financial_year === fy && r.regime === "new");
  const unverified = [oldR, newR].filter((r) => r && !r.verified);
  const verifiedDates = [oldR, newR].filter((r) => r?.verified && r.verified_at).map((r) => new Date(r.verified_at).getTime());
  const allVerified = !!(oldR || newR) && unverified.length === 0;
  const oldRules = oldR?.rules as TaxRules | undefined;

  const setOther = (k: keyof typeof blankOther) => (v: string) => setO((p) => ({ ...p, [k]: v }));
  const setCell = (k: CompKey, m: number, v: string) => setGrid((g) => ({ ...g, [k]: g[k].map((x, i) => (i === m ? v : x)) }));
  const copyAprilToAll = () => setGrid((g) => Object.fromEntries(COMPONENTS.map((c) => [c.k, Array(12).fill(g[c.k][0])])) as Grid);
  const copyPrev = (m: number) => setGrid((g) => Object.fromEntries(COMPONENTS.map((c) => [c.k, g[c.k].map((x, i) => (i === m ? g[c.k][m - 1] : x))])) as Grid);
  const rentAprilToAll = () => setRent((r) => Array(12).fill(r[0]));
  const rentPrev = (m: number) => setRent((r) => r.map((x, i) => (i === m ? r[m - 1] : x)));

  const input = useMemo<TaxInput | null>(() => {
    let months: Comp[]; let rentArr: number[];
    if (mode === "annual") {
      const a = emptyComp(); for (const c of COMPONENTS) a[c.k] = num(annual[c.k]);
      months = spreadAnnual(a); rentArr = Array(12).fill(num(o.rentAnnual) / 12);
    } else {
      months = Array.from({ length: 12 }, (_, m) => { const c = emptyComp(); for (const x of COMPONENTS) c[x.k] = num(grid[x.k][m]); return c; });
      rentArr = rent.map(num);
    }
    const t: TaxInput = {
      months, rent: rentArr, metro, age, grossOverride: mode === "annual" ? num(o.gross) : 0, otherIncome: num(o.otherIncome),
      claims: { lta: num(o.lta), childEdu: num(o.childEdu), uniform: num(o.uniform), internet: num(o.internet), meal: num(o.meal), fuel: num(o.fuel), driver: num(o.driver) },
      d80c: num(o.d80c), epf: num(o.epf), homePrincipal: num(o.homePrincipal), d80d: num(o.d80d), d80dParents: num(o.d80dParents), parentsAge, d80e: num(o.d80e), donation: num(o.donation),
      nps1b: num(o.nps1b), homeLoanInterest: num(o.homeLoanInterest), corpNpsDeclared: num(o.corpNps), giftDeclared: num(o.gift), professionalTax: num(o.professionalTax), otherDeductions: num(o.otherDed),
    };
    const hasSalary = t.grossOverride > 0 || months.some((m) => COMPONENTS.some((c) => m[c.k] > 0));
    return hasSalary ? t : null;
  }, [mode, annual, grid, rent, o, metro, age, parentsAge]);

  const res = useMemo(() => (input ? { old: oldR ? computeTax(input, oldR.rules as TaxRules, "old") : undefined, new: newR ? computeTax(input, newR.rules as TaxRules, "new") : undefined } : null), [input, oldR, newR]);
  const better = res?.old && res?.new ? (res.old.total < res.new.total ? "old" : res.new.total < res.old.total ? "new" : "equal") : null;
  const diff = res?.old && res?.new ? Math.abs(res.old.total - res.new.total) : 0;

  useEffect(() => {
    if (!res) return;
    const t = setTimeout(() => employeeApi("log_calc", { calculator: "income_tax", department: getDepartment(), rule_version_ref: `${fy}:old v${oldR?.version ?? "-"},new v${newR?.version ?? "-"}`, outputs: { old: res.old?.total, new: res.new?.total } }).catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [res, fy, oldR, newR]);

  const reset = () => { setAnnual(blankAnnual()); setGrid(blankGrid()); setRent(Array(12).fill("")); setO(blankOther); };

  type R = NonNullable<typeof res>;
  const lineRows = (r: R) => {
    const labels = (k: "exemptions" | "deductions") => [...new Set([...Object.keys(r.old?.[k] ?? {}), ...Object.keys(r.new?.[k] ?? {})])];
    const g = (t: R["old"], fn: (x: NonNullable<R["old"]>) => number) => (t ? inr(fn(t)) : "—");
    const rows: { label: string; old: string; new: string; bold?: boolean; sub?: boolean }[] = [
      { label: "Total annual gross salary", old: g(r.old, (t) => t.salaryGross), new: g(r.new, (t) => t.salaryGross) },
      { label: "Other income", old: g(r.old, (t) => t.otherIncome), new: g(r.new, (t) => t.otherIncome) },
      { label: "Standard deduction", old: g(r.old, (t) => -t.std), new: g(r.new, (t) => -t.std) },
      { label: "Total eligible exemptions", old: g(r.old, (t) => -t.exemptionTotal), new: g(r.new, (t) => -t.exemptionTotal), bold: true },
      ...labels("exemptions").map((l) => ({ label: l, old: r.old?.exemptions[l] ? inr(r.old.exemptions[l]) : "—", new: r.new?.exemptions[l] ? inr(r.new.exemptions[l]) : "—", sub: true })),
      { label: "Total eligible deductions", old: g(r.old, (t) => -t.totalDed), new: g(r.new, (t) => -t.totalDed), bold: true },
      ...labels("deductions").map((l) => ({ label: l, old: r.old?.deductions[l] ? inr(r.old.deductions[l]) : "—", new: r.new?.deductions[l] ? inr(r.new.deductions[l]) : "—", sub: true })),
      { label: "Net taxable income", old: g(r.old, (t) => t.taxable), new: g(r.new, (t) => t.taxable), bold: true },
      { label: "Income tax as per slabs", old: g(r.old, (t) => t.baseTax), new: g(r.new, (t) => t.baseTax) },
      { label: "Rebate u/s 87A", old: g(r.old, (t) => -t.rebate), new: g(r.new, (t) => -t.rebate) },
      { label: "Surcharge", old: g(r.old, (t) => t.surcharge), new: g(r.new, (t) => t.surcharge) },
      { label: "Health & Education cess", old: g(r.old, (t) => t.cess), new: g(r.new, (t) => t.cess) },
      { label: "Final annual tax liability", old: g(r.old, (t) => t.total), new: g(r.new, (t) => t.total), bold: true },
      { label: "Estimated monthly TDS", old: g(r.old, (t) => t.monthly), new: g(r.new, (t) => t.monthly), bold: true },
    ];
    return rows;
  };
  const pdf = () => {
    if (!res) return;
    const rows = lineRows(res);
    downloadReport(`Income Tax Estimate FY ${fy}`, [
      { heading: "Old regime", rows: rows.map((x) => [x.label, x.old] as [string, string]) },
      { heading: "New regime", rows: rows.map((x) => [x.label, x.new] as [string, string]) },
    ], [better && better !== "equal" ? `The ${better} regime gives lower tax by ${inr(diff)}.` : "", allVerified ? `Tax rules verified${verifiedDates.length ? ` on ${fmtDate(new Date(Math.max(...verifiedDates)).toISOString())}` : ""}.` : "Tax rules for this year have NOT been verified by HR yet. Treat this as indicative only.", disc ?? ""].filter(Boolean), `income-tax-${fy}.pdf`);
  };

  if (rules === null) return <Skeleton className="h-96" />;
  if (!rules.length) return <><PageHeader title="Income Tax Calculator" /><Notice>No published tax rules are available yet. Please contact HR or Payroll.</Notice></>;
  const m = (k: keyof typeof blankOther, label: string, hint?: string) => <Money label={label} value={o[k]} onChange={setOther(k)} hint={hint} />;
  const curFY = currentFY();

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto">
      <PageHeader title="Income Tax Calculator" text="Calculates your estimated tax under the Old and New regimes using HR-approved Indian income tax rules, and shows which one saves more." />

      <Card className="p-4 flex flex-wrap items-end gap-4 no-print">
        <div className="w-40"><Field label="Financial year"><Select value={fy} onChange={(e) => setFy(e.target.value)}>{years.map((y) => <option key={y} value={y}>FY {y}</option>)}</Select></Field></div>
        <div className="w-44"><Field label="Age category"><Select value={age} onChange={(e) => setAge(e.target.value as TaxInput["age"])}><option value="below_60">Below 60</option><option value="60_to_80">60 to 80</option><option value="above_80">Above 80</option></Select></Field></div>
        <div className="flex-1 min-w-[240px] text-sm">
          {allVerified
            ? <p className="flex items-center gap-1.5 text-emerald-700 font-semibold"><ShieldCheck className="h-4 w-4" />Tax rules verified{verifiedDates.length ? ` on ${fmtDate(new Date(Math.max(...verifiedDates)).toISOString())}` : ""}</p>
            : <p className="flex items-center gap-1.5 text-amber-800 font-semibold"><AlertTriangle className="h-4 w-4" />Tax rules for FY {fy} are not verified yet. Please verify before treating results as final.</p>}
          <p className="text-xs text-navy-3 mt-0.5">{[oldR, newR].filter(Boolean).map((r) => `${r.regime} v${r.version}${r.source ? `, source: ${r.source}` : ""}`).join(" · ")}</p>
        </div>
      </Card>
      {fy !== curFY && <Notice><AlertTriangle className="inline h-4 w-4 mr-1" />Rules for the current financial year (FY {curFY}) have not been published by HR yet. You are looking at FY {fy}; the results may not match this year's rules.</Notice>}

      <Section n="A" title="Salary details" note="Enter each component once. Gross salary is the total of these components, so nothing is counted twice.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-paper" role="tablist" aria-label="Salary entry mode">
            {(["annual", "monthly"] as const).map((x) => <button key={x} role="tab" aria-selected={mode === x} onClick={() => setMode(x)} className={cn("px-4 h-8 rounded-md text-sm font-semibold capitalize", mode === x ? "bg-white shadow text-brand-dark" : "text-navy-3")}>{x}</button>)}
          </div>
          <p className="text-xs text-navy-3">{mode === "annual" ? "Enter the total for the year (April to March)." : "Enter the amount for each month, April to March."}</p>
        </div>

        {mode === "annual" ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMPONENTS.map((c) => <Money key={c.k} label={`${c.label} (₹ per year)`} value={annual[c.k]} onChange={(v) => setAnnual((a) => ({ ...a, [c.k]: v }))} />)}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {m("gross", "Total gross salary (optional)", "Leave blank to use the total of the components above. If you fill this, it replaces the total; components are never added on top.")}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 no-print">
              <Button variant="secondary" size="sm" onClick={copyAprilToAll}><CopyPlus className="h-4 w-4" />Copy April to all months</Button>
              <p className="text-xs text-navy-3 self-center">Or use “← Prev” under a month to copy the previous month. You can edit any month afterwards without changing the others.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="text-sm w-max min-w-full">
                <thead>
                  <tr className="bg-paper text-xs text-navy-3">
                    <th className="sticky left-0 z-10 bg-paper text-left px-3 py-2 min-w-[210px]">Salary component</th>
                    {MONTHS.map((mo, i) => (
                      <th key={mo} className="px-1.5 py-2 font-semibold">
                        <div>{mo}</div>
                        {i > 0 && <button onClick={() => copyPrev(i)} className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand-dark hover:underline" title={`Copy ${MONTHS[i - 1]} to ${mo}`}><ArrowLeftToLine className="h-3 w-3" />Prev</button>}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Year total</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPONENTS.map((c) => (
                    <tr key={c.k} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold text-[13px]">{c.label}</td>
                      {MONTHS.map((mo, i) => <td key={mo} className="px-1 py-1"><input aria-label={`${c.label} ${mo}`} className={cell} inputMode="decimal" value={grid[c.k][i]} onChange={(e) => setCell(c.k, i, e.target.value)} placeholder="0" /></td>)}
                      <td className="px-3 text-right font-semibold">{inr(grid[c.k].reduce((a, v) => a + num(v), 0))}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-paper font-bold">
                    <td className="sticky left-0 z-10 bg-paper px-3 py-2">Month total</td>
                    {MONTHS.map((mo, i) => <td key={mo} className="px-2 text-right text-xs">{inr(COMPONENTS.reduce((a, c) => a + num(grid[c.k][i]), 0))}</td>)}
                    <td className="px-3 text-right">{inr(COMPONENTS.reduce((a, c) => a + grid[c.k].reduce((x, v) => x + num(v), 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="grid sm:grid-cols-2 gap-3">{m("otherIncome", "Other income (annual, ₹)", "Interest, rent received or any other taxable income")}</div>
      </Section>

      <Section n="B" title="Exemptions (Old regime only)" note="Allowances are not automatically tax-free. Enter only what you can support with bills, rent receipts or declarations. Each exemption is limited to the amount you actually received.">
        <div>
          <p className="font-bold text-sm mb-2">House Rent Allowance (HRA)</p>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <Field label="City where you live" hint={oldRules?.hra_metro_cities ? `Metro: ${oldRules.hra_metro_cities}` : "Metro cities get a higher HRA limit (50% of basic instead of 40%)"}>
              <Select value={metro ? "metro" : "non"} onChange={(e) => setMetro(e.target.value === "metro")}><option value="non">Non-metro city (40% of basic)</option><option value="metro">Metro city (50% of basic)</option></Select>
            </Field>
            {mode === "annual" && m("rentAnnual", "Total rent paid in the year (₹)")}
          </div>
          {mode === "monthly" && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2 mb-2 no-print">
                <Button variant="secondary" size="sm" onClick={rentAprilToAll}><CopyPlus className="h-4 w-4" />Copy April rent to all months</Button>
                <p className="text-xs text-navy-3">HRA exemption is worked out for each month using that month’s rent, then added up for the year.</p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {MONTHS.map((mo, i) => (
                  <label key={mo} className="block">
                    <span className="flex items-center justify-between text-xs font-semibold mb-1">{mo}{i > 0 && <button type="button" onClick={() => rentPrev(i)} className="text-[10px] text-brand-dark inline-flex items-center gap-0.5 hover:underline"><ArrowLeftToLine className="h-3 w-3" />Prev</button>}</span>
                    <Input inputMode="decimal" value={rent[i]} onChange={(e) => setRent((r) => r.map((x, k) => (k === i ? e.target.value : x)))} placeholder="Rent ₹" />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <p className="font-bold text-sm mb-2">Company allowances (eligible amount against proof, per year)</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {m("lta", "LTA: actual eligible travel expense (₹)", "Only for eligible journeys with tickets or bills")}
            {m("childEdu", "Child Education Allowance: eligible amount (₹)", `Exempt up to ₹${(oldRules?.allowance_limits?.child_education_per_child_month ?? 100).toLocaleString("en-IN")} per month per child, for up to ${oldRules?.allowance_limits?.child_education_max_children ?? 2} children`)}
            {m("uniform", "Uniform: amount spent for official duty (₹)")}
            {m("internet", "Internet & Telephone: official-use bills (₹)")}
            {m("meal", "Meal Allowance: eligible meal vouchers/bills (₹)")}
            {m("fuel", "Fuel: actual official use (₹)")}
            {m("driver", "Driver: actual official expense (₹)")}
          </div>
        </div>
        <div>
          <p className="font-bold text-sm mb-2">Personal NPS</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{m("nps1b", "Personal NPS investment (₹)", "Section 80CCD(1B): up to ₹50,000 is allowed")}</div>
        </div>
      </Section>

      <Section n="C" title="Deductions and investments" note="Applied only where the selected regime allows them under the current rules.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {m("d80c", "Section 80C investments (₹)", "PPF, ELSS, LIC, tuition fees etc. Total 80C limit applies")}
          {m("epf", "Employee PF contribution (₹)", "Counted under 80C")}
          {m("homePrincipal", "Home loan principal repaid (₹)", "Counted under 80C")}
          {m("d80d", "Section 80D: medical insurance for self, spouse & children (₹)", "Limit ₹25,000 (₹50,000 if you are 60 or above)")}
          <Field label="Parents' age" hint="Decides the 80D limit for your parents"><Select value={parentsAge} onChange={(e) => setParentsAge(e.target.value as TaxInput["parentsAge"])}><option value="below_60">Parents below 60 years</option><option value="60_plus">Parents 60 years or above</option></Select></Field>
          {m("d80dParents", "Section 80D: medical insurance premium for parents (₹)", "Limit ₹25,000 if parents are below 60, ₹50,000 if 60 or above")}
          {m("d80e", "Section 80E education loan interest (₹)")}
          {m("donation", "Section 80G donations (₹)", "50% of the amount you enter is treated as eligible")}
          {m("homeLoanInterest", "Section 24(b) home loan interest (₹)")}
          {m("corpNps", "Corporate NPS contribution (₹)", "Section 80CCD(2). Enter the amount you can show proof for")}
          {m("gift", "Gift Voucher contribution (₹)", "Enter the amount covered by gift voucher proof. That part is treated as exempt")}
          {m("professionalTax", "Professional tax paid (₹)")}
          {m("otherDed", "Other eligible deductions (₹)")}
        </div>
        <div className="flex gap-2 no-print"><Button variant="secondary" onClick={reset}><RotateCcw className="h-4 w-4" />Reset all</Button></div>
      </Section>

      {!res ? <Card className="p-8 text-center text-navy-3 text-sm">Enter your salary details above. Your tax under both regimes is calculated instantly.</Card> : <>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Trophy className="h-6 w-6 text-brand" />
            <div>
              <p className="font-extrabold text-lg">{better === "equal" || better === null ? "Both regimes give the same tax" : `${better === "old" ? "Old" : "New"} regime saves you ${inr(diff)}`}</p>
              <p className="text-sm text-navy-3">{res.old && res.new ? `Old regime ${inr(res.old.total)} · New regime ${inr(res.new.total)} · Difference ${inr(diff)}` : "Rules for one regime are not published for this year."}</p>
            </div>
          </div>
        </Card>
        <div className="grid md:grid-cols-2 gap-4">
          {(["old", "new"] as const).map((k) => { const t = res[k];
            if (!t) return <Card key={k} className="p-5 text-sm text-navy-3">No published rules for the {k} regime in FY {fy}.</Card>;
            return (
              <Card key={k} className={cn("p-5", better === k && "border-2 border-brand")}>
                <div className="flex justify-between items-center"><p className="font-bold">{k === "old" ? "Old" : "New"} Tax Regime</p>{better === k && <Badge tone="orange"><Trophy className="h-3 w-3" />Saves more</Badge>}</div>
                <p className="text-3xl font-extrabold mt-2">{inr(t.total)}</p>
                <p className="text-xs text-navy-3">Final annual tax · {inr(t.monthly)} estimated monthly TDS</p>
                <p className="text-xs text-navy-3 mt-2">Taxable income {inr(t.taxable)}</p>
              </Card>); })}
        </div>
        <Card className="p-5">
          <p className="font-bold mb-3">Detailed calculation: Old vs New</p>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-navy-3 text-xs"><th className="py-1.5">Item</th><th className="text-right">Old regime</th><th className="text-right">New regime</th></tr></thead>
            <tbody>{lineRows(res).map((r, i) => <tr key={i} className={cn("border-t border-slate-100", r.bold && "font-bold bg-paper/70")}><td className={cn("py-1.5", r.sub && "pl-5 text-navy-3")}>{r.label}</td><td className="text-right">{r.old}</td><td className="text-right">{r.new}</td></tr>)}</tbody>
          </table></div>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Show slab-wise tax</summary>
            {(["old", "new"] as const).map((k) => res[k] && (
              <div key={k} className="mt-3"><p className="text-sm font-semibold">{k === "old" ? "Old" : "New"} regime on {inr(res[k]!.taxable)}</p>
                <table className="w-full text-sm mt-1"><tbody>{res[k]!.slabRows.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1">{inr(r.from)} – {r.to ? inr(r.to) : "above"}</td><td>{r.rate}%</td><td className="text-right">{inr(r.tax)}</td></tr>)}</tbody></table></div>))}
          </details>
          {mode === "monthly" && res.old && res.old.hraByMonth.some((x) => x > 0) && (
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Show month-wise HRA exemption (Old regime)</summary>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">{MONTHS.map((mo, i) => <div key={mo} className="rounded-lg bg-paper p-2 text-center"><p className="text-xs text-navy-3">{mo}</p><p className="text-sm font-bold">{inr(res.old!.hraByMonth[i])}</p></div>)}</div>
            </details>)}
          <div className="flex gap-2 mt-5 no-print"><Button variant="secondary" onClick={pdf}><Download className="h-4 w-4" />Download PDF</Button><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button></div>
        </Card>
      </>}
      <Disclaimer text={disc ?? "This is an estimate based on the rules published by HR for the selected financial year. Your actual tax is decided by your final declarations, proofs and the Income Tax Department."} />
    </div>
  );
}
