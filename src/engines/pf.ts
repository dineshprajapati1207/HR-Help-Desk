export type PFRules = {
  employee_rate: number; employer_rate: number; eps_rate?: number; wage_ceiling?: number; eps_wage_ceiling?: number;
  apply_ceiling_to_employee?: boolean; apply_ceiling_to_employer?: boolean; include_da?: boolean; voluntary_pf_allowed?: boolean; rounding?: "round" | "ceil" | "floor";
};
export type PFInput = { basic: number; da: number; employeeRate?: number; employerRate?: number; ceiling?: number; vpf: number };

export function computePF(i: PFInput, r: PFRules) {
  const rnd = (n: number) => (r.rounding === "ceil" ? Math.ceil(n) : r.rounding === "floor" ? Math.floor(n) : Math.round(n));
  const wage = i.basic + (r.include_da === false ? 0 : i.da);
  const ceiling = i.ceiling ?? r.wage_ceiling ?? Infinity;
  const eeRate = i.employeeRate ?? r.employee_rate, erRate = i.employerRate ?? r.employer_rate;
  const eeWage = r.apply_ceiling_to_employee ? Math.min(wage, ceiling) : wage;
  const erWage = r.apply_ceiling_to_employer ? Math.min(wage, ceiling) : wage;
  const employee = rnd((eeWage * eeRate) / 100);
  const vpf = r.voluntary_pf_allowed === false ? 0 : rnd((wage * (i.vpf || 0)) / 100);
  const employerTotal = rnd((erWage * erRate) / 100);
  const epsWage = Math.min(wage, r.eps_wage_ceiling ?? ceiling);
  const eps = r.eps_rate ? Math.min(employerTotal, rnd((epsWage * r.eps_rate) / 100)) : 0;
  const employerEpf = employerTotal - eps;
  const monthly = employee + vpf + employerTotal;
  return { wage, eeWage, erWage, epsWage, employee, vpf, employerTotal, eps, employerEpf, monthly, annual: monthly * 12, eeRate, erRate };
}
