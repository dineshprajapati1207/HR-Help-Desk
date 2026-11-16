import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui";
import { employeeApi, view } from "@/lib/api";
import { calcGratuity, calcPL, type GratuityConfig, type PLConfig } from "@/engines/plGratuity";
import { inr, num } from "@/lib/format";
import { getDepartment } from "@/lib/client";

// Defaults come from the PeopleHub specification; HR can change them in Admin > Calculator Management.
const DEF_PL: PLConfig = { max_pl_days: 63, divisor_options: [30], default_divisor: 30, rounding: "round" };
const DEF_GR: GratuityConfig = { multiplier: 15, divisor: 26, cap: 2000000, eligibility_years: 4, eligibility_extra_days: 240, partial_year_months_threshold: 6, rounding: "round" };
const PL_DIVISOR = 30; // PL per-day rate = Salary base ÷ 30 (fixed)
const DISCLAIMER = "Please note that the calculated amounts are indicative estimates only and may differ from the actual calculations maintained in our HR records. These calculations should not be considered final or legally binding. They are intended only to give you an approximate idea of your PL and Gratuity entitlements as of today's date.";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const long = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const lab = "block text-[11px] font-semibold text-navy-3 mb-1";
const inp = "w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export default function PLGratuity() {
  const [cfg, setCfg] = useState<{ pl: PLConfig; gr: GratuityConfig; plV?: number; grV?: number } | null>(null);
  const [f, setF] = useState({ gross: "", conv: "", hra: "", doj: "", pl: "" });
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    view<any>("public_calculator_rules").then((r) => {
      const pl = r.find((x) => x.calculator === "pl"), gr = r.find((x) => x.calculator === "gratuity");
      setCfg({ pl: { ...DEF_PL, ...(pl?.config ?? {}), divisor_options: [PL_DIVISOR], default_divisor: PL_DIVISOR }, gr: { ...DEF_GR, ...(gr?.config ?? {}) }, plV: pl?.version, grV: gr?.version });
    }).catch(() => setCfg({ pl: DEF_PL, gr: DEF_GR }));
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const ready = !!cfg && num(f.gross) > 0 && !!f.doj;
  const bad = num(f.conv) + num(f.hra) > num(f.gross) ? "Conveyance and HRA cannot be more than your gross salary." : f.doj && f.doj > iso(today) ? "Date of joining cannot be in the future." : "";
  const res = useMemo(() => {
    if (!cfg || !ready || bad) return null;
    const divisor = PL_DIVISOR;
    const input = { gross: num(f.gross), conveyance: num(f.conv), hra: num(f.hra), doj: f.doj, plBalance: num(f.pl), calcDate: iso(today), divisor };
    return { input, pl: calcPL(input, cfg.pl), gr: calcGratuity(input, cfg.gr) };
  }, [cfg, ready, bad, f, today]);

  useEffect(() => {
    if (!res || !cfg) return;
    const t = setTimeout(() => employeeApi("log_calc", { calculator: "pl_gratuity", department: getDepartment(), rule_version_ref: `pl:v${cfg.plV ?? "default"},gratuity:v${cfg.grV ?? "default"}`, outputs: { pl: res.pl.amount, gratuity: res.gr.amount, eligible: res.gr.eligible } }).catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [res, cfg]);

  if (!cfg) return <Skeleton className="h-96 max-w-[760px]" />;
  const dur = res?.gr.duration;
  return (
    <div className="max-w-[760px]">
      <h1 className="text-xl font-extrabold mb-3">PL &amp; Gratuity Calculation</h1>
      <div className="bg-white rounded-xl border border-slate-200 border-t-[3px] border-t-teal-700 p-4 shadow-sm">
        <p className="text-sm">Please enter your details below. You can find your <b>monthly Gross Salary, Conveyance Allowance and HRA</b> in any of these documents:</p>
        <ul className="list-disc pl-6 text-sm mt-1.5 mb-4"><li>Offer Letter</li><li>Appointment Letter</li><li>Latest Appraisal Letter</li><li>Salary Slip</li></ul>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label><span className={lab}>Monthly Gross Salary (₹)</span><input className={inp} inputMode="decimal" value={f.gross} onChange={set("gross")} /></label>
          <label><span className={lab}>Monthly Conveyance Allowance (₹)</span><input className={inp} inputMode="decimal" value={f.conv} onChange={set("conv")} /></label>
          <label><span className={lab}>Monthly HRA (₹)</span><input className={inp} inputMode="decimal" value={f.hra} onChange={set("hra")} /></label>
          <label><span className={lab}>Date of Joining (DOJ)</span><input className={inp} type="date" max={iso(today)} value={f.doj} onChange={set("doj")} /></label>
          <label><span className={lab}>Current PL Balance (days)</span><input className={inp} inputMode="decimal" value={f.pl} onChange={set("pl")} /></label>
          <div><span className={lab}>PL per-day rate</span><div className={`${inp} flex items-center bg-slate-50 text-navy-3`}>Salary base ÷ {PL_DIVISOR}</div></div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4 space-y-4">
        {bad && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{bad}</p>}
        {!res && !bad && <p className="text-sm text-navy-3 text-center py-6">Enter your monthly gross salary and date of joining to see your PL and Gratuity estimate.</p>}
        {res && dur && <>
          <p className="text-xs text-navy-3">As of today: <b className="text-navy">{long(today)}</b></p>
          <section>
            <h2 className="font-bold">Salary base</h2>
            <p className="text-sm mt-1">{inr(res.input.gross)} − {inr(res.input.conveyance)} (Conveyance) − {inr(res.input.hra)} (HRA) = <b>{inr(res.pl.base)} per month</b></p>
          </section>
          <section>
            <h2 className="font-bold">Privilege Leave (PL)</h2>
            <p className="text-sm mt-1">{res.pl.eligible} day(s) × {inr(res.pl.base)} ÷ {res.pl.divisor} = <b className="text-emerald-700">{inr(res.pl.amount)}</b></p>
            {res.pl.excess > 0 && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2 mt-2">Your balance is {res.pl.actual} days. Only {cfg.pl.max_pl_days} days are counted; {res.pl.excess} days above this limit are not included.</p>}
          </section>
          <section>
            <h2 className="font-bold">Gratuity</h2>
            <p className="text-sm mt-1">Service so far: <b>{dur.years} years, {dur.months} months, {dur.days} days</b></p>
            {res.gr.eligible
              ? <p className="text-sm mt-1">{inr(res.gr.base)} × {cfg.gr.multiplier} ÷ {cfg.gr.divisor} × {res.gr.eligibleYears} year(s) = <b className="text-emerald-700">{inr(res.gr.amount)}</b>{res.gr.capApplied ? " (maximum limit applied)" : ""}</p>
              : <p className="text-sm mt-2 rounded-lg border border-orange-300 bg-orange-50 text-orange-900 p-3">You have not yet completed the required service period of {cfg.gr.eligibility_years} years and {cfg.gr.eligibility_extra_days} days for Gratuity calculation.</p>}
          </section>
          <p className="text-sm rounded-lg border border-orange-300 bg-orange-50 text-orange-900 p-3">{DISCLAIMER}</p>
        </>}
      </div>
    </div>
  );
}
