import { roundBy } from "@/lib/format";

export type PLConfig = { max_pl_days: number; divisor_options: number[]; default_divisor: number; rounding?: string };
export type GratuityConfig = { multiplier: number; divisor: number; cap: number; eligibility_years: number; eligibility_extra_days: number; partial_year_months_threshold: number; rounding?: string };
export type PLInput = { gross: number; conveyance: number; hra: number; doj: string; plBalance: number; calcDate: string; divisor: number };

export function salaryBase(i: Pick<PLInput, "gross" | "conveyance" | "hra">) { return Math.max(0, i.gross - i.conveyance - i.hra); }

export function calcPL(i: PLInput, c: PLConfig) {
  const base = salaryBase(i);
  const eligible = Math.min(Math.max(0, i.plBalance), c.max_pl_days);
  const excess = Math.max(0, i.plBalance - c.max_pl_days);
  const raw = (eligible * base) / i.divisor;
  return { base, actual: i.plBalance, eligible, excess, divisor: i.divisor, amount: roundBy(raw, c.rounding), raw,
    steps: [
      `Salary base = ${i.gross} − ${i.conveyance} − ${i.hra} = ${base}`,
      `Eligible PL = min(${i.plBalance}, ${c.max_pl_days}) = ${eligible} days${excess ? ` (${excess} days above the cap are excluded)` : ""}`,
      `PL amount = ${eligible} × ${base} ÷ ${i.divisor} = ${raw.toFixed(2)}`,
    ] };
}

/** Completed service as years / months / days between two dates. */
export function serviceDuration(doj: Date, end: Date) {
  let y = end.getFullYear() - doj.getFullYear(), m = end.getMonth() - doj.getMonth(), d = end.getDate() - doj.getDate();
  if (d < 0) { m--; d += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  return { years: Math.max(0, y), months: Math.max(0, m), days: Math.max(0, d) };
}
const parseLocal = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addYears = (d: Date, y: number) => { const x = new Date(d); x.setFullYear(x.getFullYear() + y); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function calcGratuity(i: PLInput, c: GratuityConfig) {
  const base = salaryBase(i);
  const doj = parseLocal(i.doj), end = parseLocal(i.calcDate);
  const dur = serviceDuration(doj, end);
  const eligibleOn = addDays(addYears(doj, c.eligibility_years), c.eligibility_extra_days);
  const eligible = end >= eligibleOn;
  // Additional part-year: strictly more than N months counts as a full year
  const partial = dur.months > c.partial_year_months_threshold || (dur.months === c.partial_year_months_threshold && dur.days > 0);
  const eligibleYears = dur.years + (partial ? 1 : 0);
  const raw = (base * c.multiplier / c.divisor) * eligibleYears;
  const capped = Math.min(raw, c.cap);
  return {
    base, duration: dur, eligible, eligibleOn, eligibleYears,
    amount: eligible ? roundBy(capped, c.rounding) : null, capApplied: raw > c.cap,
    steps: [
      `Service = ${dur.years} years, ${dur.months} months, ${dur.days} days`,
      `Eligibility needs ${c.eligibility_years} years and ${c.eligibility_extra_days} days → ${eligible ? "met" : "not yet met"}`,
      `Eligible years = ${dur.years}${partial ? ` + 1 (more than ${c.partial_year_months_threshold} months in the additional year)` : ""} = ${eligibleYears}`,
      `Gratuity = ${base} × ${c.multiplier} ÷ ${c.divisor} × ${eligibleYears} = ${raw.toFixed(2)}`,
      raw > c.cap ? `Capped at ${c.cap}` : `Below the cap of ${c.cap}`,
    ],
  };
}
