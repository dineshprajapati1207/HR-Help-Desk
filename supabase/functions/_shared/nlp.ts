// Rule-based reading of policy documents. No AI service is used: everything here is plain text processing,
// so every answer is a sentence taken from the policy itself (nothing is invented).

const STOP = new Set(("a an the and or of to in on at for from by with without about as is are was were be been being am do does did done have has had having will would shall should can could may might must " +
  "i me my mine we our you your he she it its they them their this that these those there here what which who whom whose when where why how if then than so such not no yes " +
  "please tell know want need get got give any some more most also just only into over under between per via etc much many long often happen happens happened whom kindly " +
  "policy policies company petpooja employee employees staff").split(/\s+/));

export const stem = (w: string) => {
  w = w.toLowerCase().replace(/'s$/, "");
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
export const tokens = (s: string) => [...new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem))];
const jaccard = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return A.size + B.size - i ? i / (A.size + B.size - i) : 0; };

const cleanLine = (l: string) => l.replace(/^[\s•\-–—*·▪●○■□➢>]+/, "").replace(/^(\(?[a-z0-9]{1,3}[.)]\s+|\d+(\.\d+)+[.)]?\s+)/i, "").replace(/\s+/g, " ").trim();
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, "").replace(/\[Page \d+\]/g, "").split("\n")) {
    const line = cleanLine(raw);
    if (line.length < 12) continue;
    const safe = line.replace(/\b(Rs|No|Nos|Mr|Mrs|Ms|Dr|vs|etc|approx|i\.e|e\.g)\.(?=\s)/gi, "$1\u0001");
    for (const s of safe.split(/(?<=[.!?])\s+(?=[A-Z0-9(₹])/)) { const t = s.replace(/\u0001/g, ".").trim(); if (t.length >= 12) out.push(t); }
  }
  return out;
}

// ---------- sections ----------
type Sec = { heading: string | null; lines: string[] };
const looksHeading = (t: string, prevBlank: boolean) => {
  if (!t || t.length > 90 || /^\[Page \d+\]$/.test(t)) return false;
  if (/^(\d+(\.\d+)*[.)]?\s+[A-Z])|^(section|clause|article|chapter|annexure)\b/i.test(t) && t.length <= 80 && !/[.;]$/.test(t)) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.split(" ").length <= 10) return true;
  if (/:$/.test(t) && t.split(" ").length <= 9) return true;
  const w = t.split(/\s+/);
  return prevBlank && w.length <= 6 && !/[.,;!?]$/.test(t) && w.filter((x) => /^[A-Z&]/.test(x)).length >= Math.ceil(w.length * 0.6);
};
export function parseSections(text: string): Sec[] {
  const secs: Sec[] = [{ heading: null, lines: [] }];
  let prevBlank = true;
  for (const raw of text.replace(/\r/g, "").replace(/\[Page \d+\]/g, "").split("\n")) {
    const t = raw.trim();
    if (!t) { prevBlank = true; continue; }
    if (looksHeading(t, prevBlank)) secs.push({ heading: t.replace(/:$/, ""), lines: [] });
    else secs[secs.length - 1].lines.push(t);
    prevBlank = false;
  }
  return secs.filter((s) => s.lines.length);
}
const headingText = (h: string) => h.replace(/^(\d+(\.\d+)*[.)]?|section|clause|article|chapter)\s*\d*[.:)-]?\s*/i, "").replace(/\s+/g, " ").trim();
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const trimEnd = (s: string) => s.replace(/[.;:,\s]+$/, "");

// ---------- metadata ----------
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(s: string): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/); if (m && +m[2] <= 12) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/); if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/); if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`;
  return null;
}
const CAT_RULES: [RegExp, string][] = [
  [/posh|sexual harass/i, "POSH"], [/salary advance|advance salary/i, "Salary Advance"], [/loan/i, "Loans"], [/referral/i, "Referral"],
  [/attendance|c-?off|comp.?off|work from home|wfh|shift/i, "Attendance"], [/leave|holiday|vacation/i, "Leave"],
  [/separation|resign|exit|notice period|terminat|full and final|f&f/i, "Separation"], [/relocat|transfer/i, "Relocation"],
  [/recruit|hiring|rehire|relative|internship|intern\b|onboard/i, "Recruitment"], [/training|development|learning|professional|certification/i, "Employee Development"],
  [/payroll|salary|reimburse|tax|pf\b|provident/i, "Payroll"], [/benefit|insurance|gratuity|medical/i, "Employee Benefits"],
];
export function detectMeta(fileName: string, text: string, categories: string[]) {
  const head = text.replace(/\[Page \d+\]/g, "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const fromName = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, "-").replace(/\s+/g, " ").replace(/(\b[A-Z])-(\w)/, "$1-$2").trim();
  const cand = head.find((l) => l.length <= 80 && /\bpolicy\b|\bprocedure\b|\bguidelines?\b/i.test(l) && !/[.;]$/.test(l));
  let title = (cand ?? fromName).replace(/^(petpooja( technologies)?( pvt\.? ltd\.?)?)\s*[-:–]?\s*/i, "").replace(/\s*[-–]\s*(v|version)\s*[\d.]+.*$/i, "").replace(/\s+/g, " ").trim();
  if (!title) title = fromName;
  title = title.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPosh\b/, "PoSH").replace(/\bHr\b/, "HR");
  const probe = `${title} ${fileName}`;
  const category = categories.find((c) => c === (CAT_RULES.find(([r]) => r.test(probe))?.[1] ?? "")) ?? categories.find((c) => c === (CAT_RULES.find(([r]) => r.test(text.slice(0, 1500)))?.[1] ?? "")) ?? "Other Policies";
  const v = text.slice(0, 4000).match(/\b(?:version|ver\.?|v)\s*[:\-]?\s*(\d+(?:\.\d+)?)\b/i);
  const e = text.slice(0, 5000).match(/effective\s*(?:from|date|on)?\s*[:\-]?\s*([^\n]{6,40})/i);
  const purpose = sentences(text).find((s) => /\b(purpose|objective|intended|aims? to|this policy)\b/i.test(s) && s.length > 40);
  return {
    title, category, version: v ? `v${v[1]}` : null, effective_date: e ? parseDate(e[1]) : null,
    description: (purpose ?? sentences(text).find((s) => s.length > 50) ?? "").slice(0, 240),
  };
}

export function diffSummary(oldText: string, newText: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = sentences(oldText), b = sentences(newText);
  const A = new Set(a.map(norm)), B = new Set(b.map(norm));
  const added = b.filter((s) => !A.has(norm(s))), removed = a.filter((s) => !B.has(norm(s)));
  if (!added.length && !removed.length) return "No substantive changes found in the text.";
  const cut = (s: string) => (s.length > 200 ? s.slice(0, 197) + "..." : s);
  return [`${added.length} sentence(s) added or changed, ${removed.length} removed or replaced.`, ...added.slice(0, 6).map((s) => `- **New:** ${cut(s)}`), ...removed.slice(0, 6).map((s) => `- **Removed:** ${cut(s)}`)].join("\n");
}

// ---------- FAQ generation ----------
export type Faq = { question: string; short_answer: string; detailed_answer: string; section: string | null; related_questions: string[] };
const shortOf = (ss: string[]) => { let out = ""; for (const x of ss.slice(0, 2)) { if (out && (out + " " + x).length > 300) break; out += (out ? " " : "") + x; } return out; };
const detailOf = (ss: string[]) => { let o = "", n = 0; for (const s of ss) { if (n >= 7 || o.length + s.length > 1100) break; o += `- ${s}\n`; n++; } return o.trim(); };

const HEAD_Q: [RegExp, (p: string, h: string) => string][] = [
  [/purpose|objective|introduction|overview|background/i, (p) => `What is the purpose of the ${p}?`],
  [/scope|applicab|coverage/i, (p) => `Who does the ${p} apply to?`],
  [/eligib/i, (p) => `Who is eligible under the ${p}?`],
  [/notice/i, (p) => `What is the notice period under the ${p}?`],
  [/approv|authori[sz]/i, (p) => `Who approves requests under the ${p}?`],
  [/document|proof/i, (p) => `Which documents are required under the ${p}?`],
  [/apply|application/i, (p) => `How do I apply under the ${p}?`],
  [/procedure|process|claim|request/i, (p) => `What is the procedure under the ${p}?`],
  [/limit|maximum|quantum|amount/i, (p) => `What are the limits or amounts under the ${p}?`],
  [/entitle|benefit/i, (p) => `What benefits or entitlements are covered under the ${p}?`],
  [/repay|recover|deduct/i, (p) => `How are repayment or recovery handled under the ${p}?`],
  [/exception|special|exclusion/i, (p) => `Are there any exceptions under the ${p}?`],
  [/penal|disciplin|misuse|violation|consequence|non.?compliance/i, (p) => `What happens if the ${p} is not followed?`],
  [/definition/i, (p) => `What do the key terms in the ${p} mean?`],
  [/contact|grievance|queries|escalat/i, (p) => `Whom should I contact about the ${p}?`],
  [/review|amend|modif/i, (p) => `Can the ${p} be changed?`],
  [/general|miscellaneous|other/i, (p) => `What other general rules apply under the ${p}?`],
];
const FACTS: { key: string; re: RegExp; q: (p: string) => string; rank: number }[] = [
  { key: "elig", re: /\b(not eligible|ineligible|eligible|entitled|not entitled)\b/i, q: (p) => `Am I eligible under the ${p}?`, rank: 1 },
  { key: "probation", re: /\bprobation/i, q: () => "What applies to employees on probation?", rank: 3 },
  { key: "max", re: /\b(maximum|up to|upto|not exceed|capped|upper limit|ceiling|at most)\b/i, q: (p) => `What is the maximum limit under the ${p}?`, rank: 2 },
  { key: "min", re: /\b(minimum|at least|not less than)\b/i, q: (p) => `What is the minimum requirement under the ${p}?`, rank: 3 },
  { key: "amount", re: /(times|x)\s+(of\s+)?(the\s+)?(gross|monthly|basic|salary|ctc)|\d+\s*%|(rs\.?|inr|₹)\s?\d/i, q: () => "How much can I get, and how is it calculated?", rank: 2 },
  { key: "deadline", re: /\bwithin\s+\d+\s*(working\s+)?(days?|hours?|weeks?|months?)|\b(no later than|not later than|deadline|last date|prior to|in advance)\b/i, q: () => "What is the time limit to apply or submit?", rank: 3 },
  { key: "approval", re: /\b(approv|sanction|authori[sz]|prior permission)/i, q: (p) => `Who approves requests under the ${p}?`, rank: 3 },
  { key: "repay", re: /\b(repay|instal+ment|emi\b|recover|settle)/i, q: () => "How is repayment or recovery done?", rank: 4 },
  { key: "interest", re: /\binterest\b/i, q: () => "Is any interest charged?", rank: 5 },
  { key: "carry", re: /\b(carry[\s-]?forward|encash|lapse|accru|accumulat|unused)/i, q: () => "What happens to the unused balance?", rank: 4 },
  { key: "late", re: /\b(half[\s-]?day|late (mark|coming|arrival)|grace)/i, q: () => "What is the rule for late coming or half days?", rank: 4 },
  { key: "docs", re: /\b(documents?|proof|certificate|medical certificate|attach|bills?|receipts?)\b/i, q: () => "Which documents do I need to submit?", rank: 4 },
  { key: "penalty", re: /\b(forfeit|disciplinary|misuse|action (will|may|shall) be taken|terminat|penal|deducted)/i, q: () => "What action can be taken if the rules are not followed?", rank: 5 },
  { key: "contact", re: /\b(contact|write to|reach out|e-?mail|report to|grievance)\b/i, q: () => "Whom should I contact for help?", rank: 5 },
];

export function buildFaqs(policyTitle: string, text: string, target: number): Faq[] {
  const p = policyTitle.replace(/\s+/g, " ").trim();
  const secs = parseSections(text);
  const all = sentences(text);
  const cands: { rank: number; order: number; q: string; ans: string[]; section: string | null }[] = [];
  let order = 0;

  // 1) one question per section
  secs.forEach((s, idx) => {
    const meta = /^(effective|version|ver\b|date|document|policy (no|number)|issued|approved|prepared|reviewed|revision|last updated)/i;
    const ss = sentences(s.lines.filter((l) => !meta.test(l)).join("\n")).filter((x) => x.length >= 25);
    if (!ss.length) return;
    const h = s.heading ? headingText(s.heading) : "";
    if (!h) { if (idx === 0) cands.push({ rank: 0, order: order++, q: `What is the ${p} about?`, ans: ss.slice(0, 7), section: null }); return; }
    if (h.toLowerCase().replace(/[^a-z]/g, "") === p.toLowerCase().replace(/[^a-z]/g, "")) { cands.push({ rank: 0, order: order++, q: `What is the ${p} about?`, ans: ss.slice(0, 7), section: s.heading }); return; }
    const hit = HEAD_Q.find(([r]) => r.test(h));
    const q = hit ? hit[1](p, h) : `What does the ${p} say about ${h.toLowerCase()}?`;
    cands.push({ rank: hit && /purpose|scope|eligib/i.test(h) ? 1 : 3, order: order++, q, ans: ss.slice(0, 7), section: s.heading });
  });

  // 2) topic questions gathered from the whole document
  for (const f of FACTS) {
    const hits = all.filter((s) => f.re.test(s)).slice(0, 5);
    if (hits.length) cands.push({ rank: f.rank, order: order++, q: f.q(p), ans: hits, section: null });
  }

  // 3) "if / in case of / when ..." sentences become "What happens if ...?"
  for (const s of all) {
    const m = s.match(/^(if|in case of|in the event of|when|once|where)\s+(.{8,110}?)(?:,|\s+then\s)\s*(.{10,})$/i);
    if (!m) continue;
    const x = trimEnd(lowerFirst(m[2]));
    if (/^(this|it|they|the same)\b/i.test(x)) continue;
    const kw = m[1].toLowerCase();
    cands.push({ rank: 6, order: order++, q: `What happens ${kw === "if" ? "if" : kw === "where" ? "when" : kw} ${x}?`, ans: [s], section: null });
  }

  // choose: by rank, then document order; drop near-duplicate questions
  const chosen: typeof cands = [];
  for (const c of cands.sort((a, b) => a.rank - b.rank || a.order - b.order)) {
    if (chosen.some((k) => jaccard(tokens(k.q), tokens(c.q)) >= 0.7)) continue;
    if (chosen.filter((k) => k.ans[0] === c.ans[0]).length >= 2) continue;
    if (c.ans.length > 1 && chosen.some((k) => k.ans[0] === c.ans[0] && k.ans[1] === c.ans[1])) continue;
    chosen.push(c);
    if (chosen.length >= target) break;
  }
  return chosen.map((c, i) => ({
    question: c.q, short_answer: shortOf(c.ans), detailed_answer: detailOf(c.ans), section: c.section ? headingText(c.section) : null,
    related_questions: [chosen[(i + 1) % chosen.length]?.q, chosen[(i + 2) % chosen.length]?.q].filter((x): x is string => !!x && x !== c.q),
  }));
}

// ---------- answering ----------
export type ChunkHit = { content: string; section?: string | null; score: number };
const SYN_GROUPS = [["salary", "pay", "wage", "ctc", "gross", "remuneration"], ["resign", "resignation", "quit", "exit", "separation"], ["leave", "holiday", "absence"], ["wfh", "remote"], ["probation", "probationary"], ["reimburse", "reimbursement", "refund", "claim"], ["manager", "supervisor"], ["increment", "hike", "raise", "appraisal"],
  ["terminate", "termination", "dismiss"], ["refer", "referral"], ["late", "delay", "tardy"]]; // (only words that mean the same thing; policy topics such as loan / salary advance / relocation stay separate)
const synMap = new Map<string, Set<string>>();
for (const g of SYN_GROUPS) { const st = new Set(g.map(stem)); for (const x of st) synMap.set(x, st); }
const has = (set: Set<string>, t: string) => set.has(t) || [...(synMap.get(t) ?? [])].some((x) => set.has(x));

/** For matching a question with a stored Q&A question: keeps words like how/much/when/who/can, which carry the meaning of a question,
 *  and reduces words to a common form (stem + synonym group) so "quit" and "resign" match. */
const KEEP_Q = new Set(["how", "what", "which", "who", "whom", "when", "where", "why", "much", "many", "long", "can", "not", "no", "if", "happen", "happens", "happened"]);
export const canon = (q: string) => [...new Set((q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1 && (KEEP_Q.has(w) || !STOP.has(w))).map(stem).map((t) => [...(synMap.get(t) ?? [t])][0]))];

/** Reads every sentence of the given policy text and returns the ones that answer the question, word for word. */
export function extractAnswer(question: string, chunks: ChunkHit[], opts: { scan?: boolean } = {}) {
  const qT = tokens(question);
  if (!qT.length || !chunks.length) return { answer: "", coverage: 0, from: -1 };
  const per = chunks.map((c) => sentences(c.content));
  type C = { s: string; pos: number; ci: number; own: Set<string>; toks: Set<string> };
  const pool: C[] = [];
  per.forEach((ss, ci) => ss.forEach((s, pos) => pool.push({ s, pos, ci, own: new Set(tokens(s)), toks: new Set(tokens(`${s} ${chunks[ci].section ?? ""}`)) })));
  if (!pool.length) return { answer: "", coverage: 0, from: -1 };
  // rarer words in the policy count more than words that appear everywhere (e.g. "loan" in a loan policy)
  const w = new Map(qT.map((t) => [t, Math.log(1 + pool.length / (1 + pool.filter((c) => has(c.toks, t)).length))]));
  const wTotal = [...w.values()].reduce((a, b) => a + b, 0) || 1;
  const numeric = /\b(how much|how many|limit|maximum|minimum|amount|days|percent|percentage|notice)\b/i.test(question);
  const scored = pool.map((c) => {
    let sc = qT.reduce((a, t) => a + (has(c.toks, t) ? w.get(t)! : 0), 0) / wTotal;
    if (sc === 0) return { c, sc: 0 };
    if (numeric && /\d/.test(c.s)) sc += 0.08;
    if (!opts.scan) sc += chunks[c.ci].score * 0.05 - c.ci * 0.02;
    if (!qT.some((t) => has(c.own, t))) sc -= 0.15; // matched only through the section heading
    return { c, sc };
  }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
  if (!scored.length) return { answer: "", coverage: 0, from: -1 };
  const best = scored[0];
  const ci = best.c.ci, ss = per[ci];
  const idx = new Set(scored.filter((x) => x.c.ci === ci && x.sc >= Math.max(0.3, best.sc * 0.6)).slice(0, 3).map((x) => x.c.pos));
  // keep the sentences around it that belong to the same rule (lists, "however ...", "provided that ...")
  for (const i of [...idx]) {
    if (/:$/.test(ss[i])) for (let k = i + 1; k <= i + 5 && k < ss.length; k++) idx.add(k);
    if (i > 0 && /^(however|provided|further|also|in addition|but|subject to|except|otherwise|such|this|these|the same)\b/i.test(ss[i])) idx.add(i - 1);
    if (i + 1 < ss.length && /^(however|provided|further|also|in addition|but|subject to|except|otherwise)\b/i.test(ss[i + 1])) idx.add(i + 1);
  }
  const order = [...idx].sort((a, b) => a - b);
  const picked: string[] = []; let len = 0;
  for (const i of order) { if (picked.length >= 8 || (picked.length && len + ss[i].length > 900)) break; picked.push(ss[i]); len += ss[i].length; }
  const covered = new Set<string>();
  order.slice(0, picked.length).forEach((i) => { const tk = pool.find((c) => c.ci === ci && c.pos === i)!.toks; qT.forEach((t) => has(tk, t) && covered.add(t)); });
  const cov = qT.reduce((a, t) => a + (covered.has(t) ? w.get(t)! : 0), 0) / wTotal;
  return { answer: picked.length === 1 ? picked[0] : picked.map((x) => `- ${x}`).join("\n"), coverage: cov, from: ci };
}
export const faqLexical = (a: string, b: string) => jaccard(tokens(a), tokens(b));

export function contactCategory(text: string) {
  if (/posh|harass|sexual|molest/i.test(text)) return "posh";
  if (/\b(tax|tds|form 16|80c|regime)\b/i.test(text)) return "income_tax";
  if (/\b(pf|provident|epf|uan)\b/i.test(text)) return "pf";
  if (/\b(loan|advance)\b/i.test(text)) return "loans";
  if (/\b(salary|payslip|payroll|reimburse)/i.test(text)) return "payroll";
  return "general_hr";
}
