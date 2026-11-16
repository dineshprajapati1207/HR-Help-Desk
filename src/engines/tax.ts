export type Slab = { upto: number | null; rate: number };
export type TaxRules = {
  standard_deduction: number;
  slabs: Record<string, Slab[]>;
  rebate?: { income_limit: number; max_rebate: number; marginal_relief?: boolean };
  surcharge?: { above: number; rate: number }[];
  cess_rate: number;
  deduction_limits?: Record<string, number>;
  allowed_deductions?: string[];
  employer_nps_limit_pct?: number;
  hra_exemption?: boolean;
  donation_eligible_pct?: number;
  hra_metro_cities?: string;
  allowance_limits?: { child_education_per_child_month?: number; child_education_max_children?: number };
};

export const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

/** Company salary components. Keys are stable; labels are what employees see. */
export const COMPONENTS = [
  { k: "basic", label: "Basic salary (incl. DA)" },
  { k: "hra", label: "House Rent Allowance (HRA)" },
  { k: "special", label: "Special allowance" },
  { k: "otherAllow", label: "Other taxable allowances" },
  { k: "bonus", label: "Bonus / variable pay" },
  { k: "childEdu", label: "Child Education Allowance" },
  { k: "lta", label: "Leave Travel Allowance (LTA)" },
  { k: "uniform", label: "Uniform Allowance" },
  { k: "internet", label: "Internet & Telephone Allowance" },
  { k: "corpNps", label: "Corporate contribution to NPS" },
  { k: "meal", label: "Meal Allowance" },
  { k: "gift", label: "Gift Voucher" },
  { k: "fuel", label: "Fuel Reimbursement" },
  { k: "driver", label: "Driver Allowance" },
  { k: "travel", label: "Travel Allowance" },
] as const;
export type CompKey = (typeof COMPONENTS)[number]["k"];
export type Comp = Record<CompKey, number>;
export const emptyComp = (): Comp => Object.fromEntries(COMPONENTS.map((c) => [c.k, 0])) as Comp;
export const sumComp = (c: Comp) => COMPONENTS.reduce((a, x) => a + (c[x.k] || 0), 0);
export const spreadAnnual = (a: Comp): Comp[] => Array.from({ length: 12 }, () => Object.fromEntries(COMPONENTS.map((c) => [c.k, (a[c.k] || 0) / 12])) as Comp);

export type TaxInput = {
  /** 12 entries, April to March. Annual entry is spread evenly by the caller. */
  months: Comp[];
  /** Rent paid in each month, April to March. */
  rent: number[];
  metro: boolean;
  age: "below_60" | "60_to_80" | "above_80";
  grossOverride: number; // annual, only used in annual entry mode; 0 = add up the components
  otherIncome: number;
  /** Eligible amounts the employee can support with bills / declarations (annual). */
  claims: { lta: number; childEdu: number; uniform: number; internet: number; meal: number; fuel: number; driver: number };
  d80c: number; epf: number; homePrincipal: number; d80d: number; d80dParents: number; parentsAge: "below_60" | "60_plus"; d80e: number; donation: number;
  nps1b: number; homeLoanInterest: number; corpNpsDeclared: number; giftDeclared: number; professionalTax: number; otherDeductions: number;
};

export function slabTax(income: number, slabs: Slab[]) {
  let tax = 0, prev = 0; const rows: { from: number; to: number | null; rate: number; tax: number }[] = [];
  for (const s of slabs) {
    const top = s.upto ?? Infinity;
    if (income > prev) {
      const part = Math.min(income, top) - prev;
      const t = (part * s.rate) / 100;
      tax += t; rows.push({ from: prev, to: s.upto, rate: s.rate, tax: t });
    }
    prev = top;
    if (income <= top) break;
  }
  return { tax, rows };
}

/** HRA exemption month by month: least of HRA received, rent paid minus 10% of basic, and 50% (metro) / 40% of basic. */
export function hraMonthly(i: Pick<TaxInput, "months" | "rent" | "metro">) {
  return i.months.map((m, k) => {
    const rent = i.rent[k] || 0;
    if (!m.hra || !rent) return 0;
    return Math.max(0, Math.min(m.hra, rent - 0.1 * m.basic, (i.metro ? 0.5 : 0.4) * m.basic));
  });
}

export function totalsOf(months: Comp[]): Comp {
  const t = emptyComp();
  for (const m of months) for (const c of COMPONENTS) t[c.k] += m[c.k] || 0;
  return t;
}

export function computeTax(i: TaxInput, r: TaxRules, regime: "old" | "new") {
  const tot = totalsOf(i.months);
  const componentsGross = sumComp(tot);
  const salaryGross = i.grossOverride > 0 ? i.grossOverride : componentsGross;
  const gross = salaryGross + i.otherIncome;
  const allowed = new Set(r.allowed_deductions ?? []);
  const lim = r.deduction_limits ?? {};
  const cap = (k: string, v: number) => (lim[k] != null ? Math.min(v, lim[k]) : v);
  const old = regime === "old";

  // ---- Exemptions (old regime only; each one needs proof, so it is limited to what the employee declares) ----
  const exemptions: Record<string, number> = {};
  const hraByMonth = old && r.hra_exemption ? hraMonthly(i) : Array(12).fill(0);
  const hraEx = hraByMonth.reduce((a, b) => a + b, 0);
  if (hraEx > 0) exemptions["HRA"] = hraEx;
  if (old) {
    const lm = r.allowance_limits ?? {};
    // exempt only up to the yearly limit (per child x number of children allowed), whatever amount is claimed
    const childLimit = (lm.child_education_per_child_month ?? 100) * 12 * (lm.child_education_max_children ?? 2);
    const proof = (label: string, received: number, claimed: number, max = Infinity) => {
      const v = Math.max(0, Math.min(received, claimed, max));
      if (v > 0) exemptions[label] = v;
    };
    proof("Leave Travel Allowance", tot.lta, i.claims.lta);
    proof("Child Education Allowance", tot.childEdu, i.claims.childEdu, childLimit);
    proof("Uniform Allowance", tot.uniform, i.claims.uniform);
    proof("Internet & Telephone", tot.internet, i.claims.internet);
    proof("Meal Allowance", tot.meal, i.claims.meal);
    proof("Fuel Reimbursement", tot.fuel, i.claims.fuel);
    proof("Driver Allowance", tot.driver, i.claims.driver);
  }
  const exemptionTotal = Object.values(exemptions).reduce((a, b) => a + b, 0);

  // ---- Deductions (only what the regime allows) ----
  const std = Math.min(r.standard_deduction ?? 0, salaryGross);
  const ded: Record<string, number> = {};
  if (allowed.has("80c")) ded["80C"] = cap("80c", i.d80c + i.epf + i.homePrincipal);
  if (allowed.has("80d")) {
    const below = lim["80d"] ?? 25000, senior = lim["80d_senior"] ?? 50000;
    ded["80D medical insurance (self & family)"] = Math.min(i.d80d, i.age === "below_60" ? below : senior);
    ded["80D medical insurance (parents)"] = Math.min(i.d80dParents, i.parentsAge === "60_plus" ? senior : below);
  }
  if (allowed.has("80e")) ded["80E education loan interest"] = i.d80e;
  if (allowed.has("80g")) ded["80G donations"] = (i.donation * (r.donation_eligible_pct ?? 50)) / 100;
  if (allowed.has("nps_80ccd1b")) ded["Personal NPS 80CCD(1B)"] = cap("nps_80ccd1b", i.nps1b);
  if (allowed.has("home_loan_interest_24b")) ded["Home loan interest 24(b)"] = cap("home_loan_interest_24b", i.homeLoanInterest);
  if (allowed.has("employer_nps_80ccd2")) {
    const limit = ((r.employer_nps_limit_pct ?? 0) / 100) * tot.basic;
    const received = tot.corpNps > 0 ? tot.corpNps : i.corpNpsDeclared;
    ded["Corporate NPS 80CCD(2)"] = Math.min(i.corpNpsDeclared, received, limit > 0 ? limit : Infinity);
  }
  if (allowed.has("gift_voucher")) ded["Gift voucher (against proof)"] = Math.min(i.giftDeclared, tot.gift > 0 ? tot.gift : i.giftDeclared);
  if (allowed.has("professional_tax")) ded["Professional tax"] = cap("professional_tax", i.professionalTax);
  if (allowed.has("other")) ded["Other eligible deductions"] = i.otherDeductions;
  for (const k of Object.keys(ded)) if (!ded[k]) delete ded[k];
  const totalDed = Object.values(ded).reduce((a, b) => a + b, 0);

  const taxable = Math.max(0, gross - std - exemptionTotal - totalDed);
  const slabs = r.slabs[i.age] ?? r.slabs.below_60 ?? Object.values(r.slabs)[0];
  const { tax: baseTax, rows } = slabTax(taxable, slabs);

  let rebate = 0;
  if (r.rebate && taxable <= r.rebate.income_limit) rebate = Math.min(baseTax, r.rebate.max_rebate);
  else if (r.rebate?.marginal_relief && taxable > r.rebate.income_limit) {
    const excess = taxable - r.rebate.income_limit;
    if (baseTax > excess) rebate = baseTax - excess; // tax cannot exceed the income above the rebate limit
  }
  const afterRebate = Math.max(0, baseTax - rebate);
  let surRate = 0;
  for (const s of r.surcharge ?? []) if (taxable > s.above) surRate = s.rate;
  const surcharge = (afterRebate * surRate) / 100;
  const cess = ((afterRebate + surcharge) * (r.cess_rate ?? 0)) / 100;
  const total = Math.round(afterRebate + surcharge + cess);
  return { regime, gross, salaryGross, componentsGross, otherIncome: i.otherIncome, std, hraByMonth, exemptions, exemptionTotal, deductions: ded, totalDed, taxable, slabRows: rows, baseTax, rebate, surRate, surcharge, cess, total, monthly: Math.round(total / 12) };
}

/** Financial year (e.g. "2026-27") that contains the given date. */
export function currentFY(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
