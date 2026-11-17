# Petpooja PeopleHub

AI-powered HR policy and employee assistance platform.

- **Employee portal:** `/` (no login)
- **Admin portal:** `/admin` (no login; protected server-side by trusted network)

Stack: React + TypeScript + Vite, Tailwind, Recharts · Supabase (Postgres + pgvector, Storage, Edge Functions) · no external AI key (built-in Supabase embeddings)

---

## 1. Setup (about 15 minutes)

### a) Supabase project
1. Create a project at supabase.com.
2. Install the CLI and link: `npx supabase login` then `npx supabase link --project-ref <your-ref>`
3. Apply the database: `npx supabase db push`
   (creates all 21 tables, pgvector search functions, read-only employee views, RLS lock-down, the private `documents` bucket and seed settings).

### b) Edge Function secrets
**No AI key is needed.** Policies are read, indexed and answered with plain text processing plus Supabase's built-in embedding model.
Only protect the admin area:
```bash
npx supabase secrets set ADMIN_PASSCODE=your-long-secret ADMIN_ALLOWED_IPS=203.0.113.10
```
Optional: `ALLOWED_ORIGIN` (your site URL for CORS), `ADMIN_PROXY_TOKEN` (see security below).

### c) Deploy functions
```bash
npx supabase functions deploy chat
npx supabase functions deploy public
npx supabase functions deploy draft-email
npx supabase functions deploy admin
```

### d) Frontend
```bash
cp .env.example .env     # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev              # http://localhost:5173  and  /admin
```
Deploy to Vercel as a Vite project with the same two env vars (`vercel.json` handles SPA routing).

---

## 2. First run: import the policy library

1. Open `/admin` → **Document Management** → **Upload documents**.
2. Drop **Policy.zip** (type: Policy document). It is unzipped server-side (nested folders and nested ZIPs are handled); each file is extracted, matched to a policy, chunked, embedded, and gets 10–20 suggested FAQs.
3. Upload **Income Tax calculator Rule.txt** with type **Income Tax Rules** (files with “income tax … rule” in the name inside a ZIP are detected automatically). It is parsed into **draft** tax rules under Calculator Management.
4. Review each document (**Review** button): fix metadata, correct extracted text if needed (re-indexes automatically), compare against the previous version, then **Approve and publish**. Nothing reaches employees before this.
5. **Calculator Management → Income tax rules:** compare the parsed drafts with the file, then **Verified, publish**. The seeded FY 2025-26 rules are marked *unverified* and show a warning until you replace or verify them. Add FY 2026-27 with **Add financial year / rules**.
6. **Contact Directory:** add Apurv Christian's phone number and contacts for Payroll, Income Tax, PF, Loans and POSH.
7. **Disclaimers:** enter and publish the approved text for each calculator.
8. **PF rules:** the PF calculator stays off (showing the PF/Payroll contact) until you publish PF rules.

---

## 3. How answers are produced (no AI key)

- Uploading a policy extracts its text, detects the policy name, version and effective date, splits it into sections and indexes it with the built-in `gte-small` embeddings.
- FAQs are built from the policy text itself: one question per section, plus topic questions (eligibility, limits, notice period, repayment, documents, time limits...) and "What happens if ...?" questions. Every answer is a sentence copied from the policy, so nothing is invented. HR reviews and edits them in Document Management before employees see them.
- When an employee asks a question, an approved FAQ answers it if it matches closely; otherwise the best matching sentences of the policy are shown with their source. If the policy does not contain the answer, the employee is told so and shown the HR contact.
- Income tax and PF rule files are not read automatically; enter those values in Admin > Calculator Management.

## 4. Security model

- The browser only has the Supabase **anon key**. All base tables have RLS enabled with no anon access; employees can only `SELECT` from filtered views (`public_policies`, `public_faqs`, `public_contacts`, …).
- Every write goes through Edge Functions using the service role, which never leaves the server. AI keys are Edge Function secrets only.
- **Admin passcode (recommended):** run `npx supabase secrets set ADMIN_PASSCODE=your-long-secret`. `/admin` then shows a sign-in screen, the Admin button/tile is hidden from everyone who is not signed in, and the server rejects admin requests without the passcode. If `ADMIN_ALLOWED_IPS` is also a real IP list, both must match.
- Without a passcode, the `admin` function rejects every request whose client IP is not in `ADMIN_ALLOWED_IPS`, or that does not carry `x-admin-proxy-token` matching `ADMIN_PROXY_TOKEN` (for setups where an internal reverse proxy / VPN gateway injects it). The `/admin` page itself shows "restricted" outside the trusted network.
- Employee chat history is keyed to an anonymous per-browser ID; analytics show question text only in aggregate.
- Documents live in a private bucket and are served through short-lived signed URLs, only for active policies marked downloadable.

## 5. Project map
```
supabase/migrations/…_peoplehub.sql   schema, search functions, views, RLS, seeds
supabase/functions/chat               RAG assistant
supabase/functions/public             employee-side actions (history, feedback, downloads, calc logging)
supabase/functions/draft-email        email generator
supabase/functions/admin              admin API + ingestion (ingest.ts)
supabase/functions/_shared            text reading, extraction (PDF/DOC/DOCX/TXT/XLSX/CSV/JSON/ZIP), chunking, guards
src/engines                           PL, gratuity, income tax, PF calculation engines (rules come from the DB)
src/pages/employee, src/pages/admin   the two portals
```

## 6. Notes
- Scanned (image-only) PDFs have no text; the upload flags them so you can provide a text PDF or DOCX.
- Legacy `.doc` uses a fallback reader; check the extracted text before publishing.
- Calculator results are logged with the rule version used (Calculator Management → Calculation history).

## 7. Q&A first, then the policy

Answer order for every employee question: (1) an approved Q&A that matches, answered exactly as written; (2) the exact sentences of the relevant policy; (3) otherwise "For this information, please contact HR. If you would like the HR contact details, I can share them with you." The HR details (Apurv Christian, number, email) are shown only after the employee says yes.
Admin > Policy Management > **Import Q&A** loads the 1,560 ready-made Q&As (`src/data/qaBundle.json`) into the matching policies. **Delete** on a policy removes it permanently (type DELETE to confirm).

## 8. What changed in this version

- New employee layout: top bar (Menu, Back, Home, Admin for admins only, search), colourful policy tiles with question count and version, tiles for PL & Gratuity, Income Tax and Contact HR.
- Employees do not see or download the full policy document; they get its questions, answers and chat answers only.
- Each policy has its own page (`/policy/<id>`) with all its questions and answers, in the policy's colour, plus a box to type your own question. New or updated policies appear automatically after approval.
- FAQ generation now creates up to 18 / 28 / 38 questions (short, medium, long policy) from the policy text, with no AI key. Chat answers are sentences taken from the policy. To get the new count for an old policy, open Document Management and regenerate its FAQs.
- Income Tax Calculator: Annual or Monthly (Apr-Mar) entry with "Copy April to all months" and "Prev" copy buttons, month-wise rent and HRA exemption, all company allowances, corporate NPS and gift voucher under Deductions, personal NPS (max Rs 50,000) under Exemptions, 50% of donations counted, live Old vs New comparison, FY and "last verified" date shown. FY 2026-27 rules are seeded as UNVERIFIED: verify them in Admin > Calculator Management > Income tax rules.
- PL & Gratuity: PL per-day rate is Salary base ÷ 30; layout as requested, gratuity only after 4 years and 240 days, mandatory disclaimer.
- Contact HR page with the draft-email form (edit, copy, open in email app; never sent automatically).

After pulling this version run `npx supabase db push --linked` (adds FY 2026-27 rules) and `npx supabase functions deploy admin chat public draft-email`.
