export type ContactPerson = { name: string; email: string; mobile: string };
export type PolicyContact = { people: ContactPerson[]; message?: undefined } | { message: string; people?: undefined };

/** Who employees should contact for specific policies (Contact HR tab). Every other policy uses the default HR contact. */
const RULES: { test: RegExp; contact: PolicyContact }[] = [
  { test: /re-?hire|internal\s*job\s*transfer/i, contact: { people: [
    { name: "Hitanshi Thakkar", email: "hitanshi.thakkar@petpooja.com", mobile: "7486906203" },
    { name: "Mittal Prajapati", email: "mittal.prajapati@petpooja.com", mobile: "8155091116" },
  ] } },
  { test: /posh/i, contact: { message: "For any queries or concerns, please contact the Presiding Officer or IC Team Members." } },
  { test: /separation/i, contact: { people: [{ name: "Yogita", email: "yogita.m@petpooja.com", mobile: "8511834515" }] } },
  { test: /internship/i, contact: { people: [{ name: "Hemaxi Vagadiya", email: "hemaxi.vagadiya@petpooja.com", mobile: "8866121036" }] } },
];

export function policyContact(policyName: string | null | undefined): PolicyContact | null {
  if (!policyName) return null;
  return RULES.find((r) => r.test.test(policyName))?.contact ?? null;
}
