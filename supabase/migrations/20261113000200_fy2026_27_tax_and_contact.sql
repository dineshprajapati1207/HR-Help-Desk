-- FY 2026-27 income tax rules (the financial year running Apr 2026 - Mar 2027).
-- Published as UNVERIFIED on purpose: employees see a "not verified" warning until HR checks the figures against the
-- official Income Tax Department / Finance Act sources in Admin > Calculator Management > Income tax rules and marks them verified.
-- Union Budget 2026 (1 Feb 2026) kept the slab structure of Budget 2025, so the figures below mirror FY 2025-26.
-- New optional keys used by the calculator: donation_eligible_pct, allowance_limits, hra_metro_cities.

insert into tax_rules (financial_year, regime, rules, status, verified, source, effective_from, effective_to, notes)
select '2026-27', 'new', '{
  "standard_deduction":75000,
  "slabs":{"below_60":[{"upto":400000,"rate":0},{"upto":800000,"rate":5},{"upto":1200000,"rate":10},{"upto":1600000,"rate":15},{"upto":2000000,"rate":20},{"upto":2400000,"rate":25},{"upto":null,"rate":30}]},
  "rebate":{"income_limit":1200000,"max_rebate":60000,"marginal_relief":true},
  "surcharge":[{"above":5000000,"rate":10},{"above":10000000,"rate":15},{"above":20000000,"rate":25}],
  "cess_rate":4,
  "deduction_limits":{},
  "allowed_deductions":["employer_nps_80ccd2","gift_voucher"],
  "employer_nps_limit_pct":14,
  "hra_exemption":false,
  "allowance_limits":{}
}'::jsonb, 'published', false, 'Seed for FY 2026-27: verify on incometax.gov.in / Finance Act before relying on it', '2026-04-01', '2027-03-31', 'Unverified seed. HR to verify and publish as verified.'
where not exists (select 1 from tax_rules where financial_year = '2026-27' and regime = 'new' and status = 'published');

insert into tax_rules (financial_year, regime, rules, status, verified, source, effective_from, effective_to, notes)
select '2026-27', 'old', '{
  "standard_deduction":50000,
  "slabs":{"below_60":[{"upto":250000,"rate":0},{"upto":500000,"rate":5},{"upto":1000000,"rate":20},{"upto":null,"rate":30}],
           "60_to_80":[{"upto":300000,"rate":0},{"upto":500000,"rate":5},{"upto":1000000,"rate":20},{"upto":null,"rate":30}],
           "above_80":[{"upto":500000,"rate":0},{"upto":1000000,"rate":20},{"upto":null,"rate":30}]},
  "rebate":{"income_limit":500000,"max_rebate":12500,"marginal_relief":false},
  "surcharge":[{"above":5000000,"rate":10},{"above":10000000,"rate":15},{"above":20000000,"rate":25},{"above":50000000,"rate":37}],
  "cess_rate":4,
  "deduction_limits":{"80c":150000,"80d":25000,"80d_senior":50000,"nps_80ccd1b":50000,"home_loan_interest_24b":200000,"professional_tax":2500},
  "allowed_deductions":["80c","80d","80e","80g","nps_80ccd1b","home_loan_interest_24b","employer_nps_80ccd2","gift_voucher","professional_tax","other"],
  "employer_nps_limit_pct":10,
  "hra_exemption":true,
  "donation_eligible_pct":50,
  "hra_metro_cities":"Delhi, Mumbai, Kolkata and Chennai (confirm the list notified for the year)",
  "allowance_limits":{"child_education_per_child_month":100,"child_education_max_children":2}
}'::jsonb, 'published', false, 'Seed for FY 2026-27: verify on incometax.gov.in / Finance Act before relying on it', '2026-04-01', '2027-03-31', 'Unverified seed. HR to verify and publish as verified.'
where not exists (select 1 from tax_rules where financial_year = '2026-27' and regime = 'old' and status = 'published');

-- HR contact shown to employees (as provided by HR). Only fills blanks, never overwrites edits made in Admin.
update contact_directory set phone = coalesce(phone, '6358929782'), email = coalesce(email, 'hr@petpooja.com')
where name = 'Apurv Christian';
