-- Petpooja PeopleHub schema
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ============ CORE CONTENT ============
create table policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text not null default 'Other Policies',
  description text,
  status text not null default 'draft' check (status in ('draft','active','inactive','archived')),
  current_version_id uuid,
  downloadable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete set null,
  kind text not null default 'policy' check (kind in ('policy','tax_rule','pf_rule','other')),
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  parent_document_id uuid references documents(id) on delete set null,
  status text not null default 'uploaded' check (status in ('uploaded','extracting','embedding','generating_faqs','review','published','rejected','error')),
  progress int not null default 0,
  error text,
  uploaded_by text default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  version_number int not null default 1,
  version_label text,
  title text,
  category text,
  effective_date date,
  extracted_text text,
  change_summary text,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','superseded')),
  updated_by text default 'admin',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table policies add constraint policies_current_version_fk
  foreign key (current_version_id) references document_versions(id) on delete set null;

create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references document_versions(id) on delete cascade,
  policy_id uuid references policies(id) on delete cascade,
  chunk_index int not null,
  section text,
  content text not null,
  tsv tsvector generated always as (to_tsvector('english', coalesce(section,'') || ' ' || content)) stored,
  created_at timestamptz not null default now()
);
create index document_chunks_version_idx on document_chunks(version_id);
create index document_chunks_tsv_idx on document_chunks using gin(tsv);

create table document_embeddings (
  chunk_id uuid primary key references document_chunks(id) on delete cascade,
  embedding vector(1536) not null,
  model text,
  created_at timestamptz not null default now()
);
create index document_embeddings_hnsw on document_embeddings using hnsw (embedding vector_cosine_ops);

create table faqs (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  version_id uuid references document_versions(id) on delete set null,
  question text not null,
  short_answer text,
  detailed_answer text,
  section text,
  related_questions text[] default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  source text not null default 'ai' check (source in ('ai','admin','knowledge_gap')),
  view_count int not null default 0,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_policy_idx on faqs(policy_id, status);
create index faqs_embedding_hnsw on faqs using hnsw (embedding vector_cosine_ops);

create table faq_versions (
  id uuid primary key default gen_random_uuid(),
  faq_id uuid references faqs(id) on delete cascade,
  snapshot jsonb not null,
  changed_by text default 'admin',
  created_at timestamptz not null default now()
);

-- ============ CALCULATOR RULES ============
create table tax_rules (
  id uuid primary key default gen_random_uuid(),
  financial_year text not null,
  regime text not null check (regime in ('old','new')),
  version int not null default 1,
  rules jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','inactive')),
  verified boolean not null default false,
  verified_at timestamptz,
  source text,
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tax_rules_one_published on tax_rules(financial_year, regime) where status = 'published';

create table pf_rules (
  id uuid primary key default gen_random_uuid(),
  version int not null default 1,
  rules jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','inactive')),
  verified boolean not null default false,
  verified_at timestamptz,
  source text,
  effective_from date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table calculator_rule_versions (
  id uuid primary key default gen_random_uuid(),
  calculator text not null check (calculator in ('pl','gratuity','disclaimer_pl_gratuity','disclaimer_tax','disclaimer_pf')),
  version int not null default 1,
  config jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','inactive')),
  effective_from date,
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create unique index calc_rules_one_published on calculator_rule_versions(calculator) where status = 'published';

create table calculator_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table calculation_history (
  id uuid primary key default gen_random_uuid(),
  calculator text not null,
  client_id text,
  department text,
  rule_version_ref text,
  inputs jsonb,
  outputs jsonb,
  created_at timestamptz not null default now()
);
create index calculation_history_created_idx on calculation_history(created_at);

-- ============ CHAT ============
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  title text,
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_sessions_client_idx on chat_sessions(client_id, updated_at desc);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  confidence text check (confidence in ('high','medium','low')),
  topic text,
  sources jsonb default '[]',
  related_questions jsonb default '[]',
  unanswered_parts text,
  contact jsonb,
  department text,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on chat_messages(session_id, created_at);
create index chat_messages_created_idx on chat_messages(created_at);

create table query_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references chat_messages(id) on delete cascade,
  helpful boolean not null,
  comment text,
  created_at timestamptz not null default now()
);

create table unanswered_queries (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  topic text,
  ask_count int not null default 1,
  confidence text,
  closest_content jsonb default '[]',
  status text not null default 'needs_review' check (status in ('needs_review','answered','linked','unsupported')),
  linked_policy_id uuid references policies(id) on delete set null,
  approved_answer text,
  faq_id uuid references faqs(id) on delete set null,
  embedding vector(1536),
  first_asked_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now()
);

-- ============ DIRECTORY / CONTENT ============
create table contact_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  department text,
  escalation_category text not null check (escalation_category in ('general_hr','payroll','income_tax','pf','loans','posh','other')),
  availability text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table email_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id text,
  scenario text,
  inputs jsonb,
  subject text,
  body text,
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  priority text not null default 'normal' check (priority in ('normal','important')),
  is_active boolean not null default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  actor text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs(created_at desc);

create table system_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ============ SEARCH FUNCTIONS ============
-- Only chunks of the CURRENT approved version of ACTIVE policies are ever searchable.
create or replace function match_policy_chunks(query_embedding vector(1536), match_count int default 8, filter_policy uuid default null)
returns table (chunk_id uuid, policy_id uuid, policy_name text, category text, version_label text, version_number int,
               effective_date date, published_at timestamptz, section text, content text, similarity float)
language sql stable as $$
  select c.id, p.id, p.name, p.category, v.version_label, v.version_number, v.effective_date, v.published_at,
         c.section, c.content, 1 - (e.embedding <=> query_embedding) as similarity
  from document_embeddings e
  join document_chunks c on c.id = e.chunk_id
  join policies p on p.current_version_id = c.version_id and p.status = 'active'
  join document_versions v on v.id = c.version_id and v.approval_status = 'approved'
  where filter_policy is null or p.id = filter_policy
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function keyword_policy_chunks(query_text text, match_count int default 6, filter_policy uuid default null)
returns table (chunk_id uuid, policy_id uuid, policy_name text, category text, version_label text, version_number int,
               effective_date date, published_at timestamptz, section text, content text, rank float)
language sql stable as $$
  select c.id, p.id, p.name, p.category, v.version_label, v.version_number, v.effective_date, v.published_at,
         c.section, c.content, ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as rank
  from document_chunks c
  join policies p on p.current_version_id = c.version_id and p.status = 'active'
  join document_versions v on v.id = c.version_id and v.approval_status = 'approved'
  where c.tsv @@ websearch_to_tsquery('english', query_text)
    and (filter_policy is null or p.id = filter_policy)
  order by rank desc
  limit match_count;
$$;

create or replace function match_faqs(query_embedding vector(1536), match_count int default 4)
returns table (faq_id uuid, policy_id uuid, policy_name text, question text, short_answer text, detailed_answer text,
               section text, similarity float)
language sql stable as $$
  select f.id, p.id, p.name, f.question, f.short_answer, f.detailed_answer, f.section,
         1 - (f.embedding <=> query_embedding)
  from faqs f join policies p on p.id = f.policy_id and p.status = 'active'
  where f.status = 'approved' and f.embedding is not null
  order by f.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_unanswered(query_embedding vector(1536), threshold float default 0.9)
returns table (id uuid, similarity float)
language sql stable as $$
  select u.id, 1 - (u.embedding <=> query_embedding) as similarity
  from unanswered_queries u
  where u.embedding is not null and u.status = 'needs_review'
    and 1 - (u.embedding <=> query_embedding) >= threshold
  order by u.embedding <=> query_embedding limit 1;
$$;

-- ============ PUBLIC (EMPLOYEE) READ-ONLY VIEWS ============
create or replace view public_policies as
  select p.id, p.name, p.slug, p.category, p.description, p.downloadable, p.updated_at,
         v.version_number, v.version_label, v.effective_date, v.published_at,
         (select count(*) from faqs f where f.policy_id = p.id and f.status = 'approved') as faq_count
  from policies p join document_versions v on v.id = p.current_version_id
  where p.status = 'active' and v.approval_status = 'approved';

create or replace view public_faqs as
  select f.id, f.policy_id, p.name as policy_name, p.category, f.question, f.short_answer, f.detailed_answer,
         f.section, f.related_questions, f.view_count, f.updated_at
  from faqs f join policies p on p.id = f.policy_id and p.status = 'active'
  where f.status = 'approved';

create or replace view public_contacts as
  select id, name, phone, email, department, escalation_category, availability, is_default
  from contact_directory where is_active;

create or replace view public_announcements as
  select id, title, body, priority, starts_at, created_at from announcements
  where is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());

create or replace view public_tax_rules as
  select id, financial_year, regime, version, rules, verified, verified_at, source, effective_from, effective_to
  from tax_rules where status = 'published';

create or replace view public_pf_rules as
  select id, version, rules, verified, verified_at, source, effective_from from pf_rules where status = 'published';

create or replace view public_calculator_rules as
  select id, calculator, version, config, effective_from, approved_at
  from calculator_rule_versions where status = 'published';

create or replace view public_settings as
  select key, value from system_settings where is_public;

-- Lock down base tables: RLS on, no anon policies. All writes go through Edge Functions (service role).
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
grant select on public_policies, public_faqs, public_contacts, public_announcements,
  public_tax_rules, public_pf_rules, public_calculator_rules, public_settings to anon, authenticated;
revoke execute on function match_policy_chunks(vector, int, uuid) from anon, authenticated, public;
revoke execute on function keyword_policy_chunks(text, int, uuid) from anon, authenticated, public;
revoke execute on function match_faqs(vector, int) from anon, authenticated, public;
revoke execute on function match_unanswered(vector, float) from anon, authenticated, public;

-- Private storage bucket (served via short-lived signed URLs only)
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

-- ============ SEED (no invented contacts, numbers or disclaimers) ============
insert into system_settings (key, value, is_public) values
  ('app', '{"name":"Petpooja PeopleHub","fallback_message":"For further assistance, please contact:"}', true),
  ('confidence_thresholds', '{"high":0.55,"medium":0.40}', false),
  ('departments', '["Sales","Support","Training","Operations","Engineering","Product","HR","Finance","Marketing","Other"]', true);

insert into contact_directory (name, phone, email, department, escalation_category, availability, is_default)
values ('Apurv Christian', null, null, 'HR', 'general_hr', null, true);

insert into calculator_rule_versions (calculator, version, config, status, approved_by, approved_at, notes) values
  ('pl', 1, '{"max_pl_days":63,"divisor_options":[26,30],"default_divisor":26,"rounding":"round"}', 'published', 'initial setup', now(), 'From the PeopleHub specification'),
  ('gratuity', 1, '{"multiplier":15,"divisor":26,"cap":2000000,"eligibility_years":4,"eligibility_extra_days":240,"partial_year_months_threshold":6,"rounding":"round"}', 'published', 'initial setup', now(), 'From the PeopleHub specification. HR to confirm the eligibility rule.');
-- Disclaimers are intentionally not seeded: Admin enters and publishes them.
-- PF rules are intentionally not seeded: the PF calculator stays disabled until HR publishes rules.

-- Income tax: seeded as published but UNVERIFIED, so employees see a warning until HR verifies them against
-- "Income Tax calculator Rule.txt" (upload it in Admin > Documents with type "Income Tax Rules").
insert into tax_rules (financial_year, regime, rules, status, verified, source, effective_from, effective_to, notes) values
('2025-26','new','{
  "standard_deduction":75000,
  "slabs":{"below_60":[{"upto":400000,"rate":0},{"upto":800000,"rate":5},{"upto":1200000,"rate":10},{"upto":1600000,"rate":15},{"upto":2000000,"rate":20},{"upto":2400000,"rate":25},{"upto":null,"rate":30}]},
  "rebate":{"income_limit":1200000,"max_rebate":60000,"marginal_relief":true},
  "surcharge":[{"above":5000000,"rate":10},{"above":10000000,"rate":15},{"above":20000000,"rate":25}],
  "cess_rate":4,
  "deduction_limits":{},
  "allowed_deductions":["employer_nps_80ccd2"],
  "employer_nps_limit_pct":14,
  "hra_exemption":false
}','published',false,'Seed: verify against Income Tax calculator Rule.txt','2025-04-01','2026-03-31','Unverified seed'),
('2025-26','old','{
  "standard_deduction":50000,
  "slabs":{"below_60":[{"upto":250000,"rate":0},{"upto":500000,"rate":5},{"upto":1000000,"rate":20},{"upto":null,"rate":30}],
           "60_to_80":[{"upto":300000,"rate":0},{"upto":500000,"rate":5},{"upto":1000000,"rate":20},{"upto":null,"rate":30}],
           "above_80":[{"upto":500000,"rate":0},{"upto":1000000,"rate":20},{"upto":null,"rate":30}]},
  "rebate":{"income_limit":500000,"max_rebate":12500,"marginal_relief":false},
  "surcharge":[{"above":5000000,"rate":10},{"above":10000000,"rate":15},{"above":20000000,"rate":25},{"above":50000000,"rate":37}],
  "cess_rate":4,
  "deduction_limits":{"80c":150000,"80d":25000,"80d_senior":50000,"nps_80ccd1b":50000,"home_loan_interest_24b":200000},
  "allowed_deductions":["80c","80d","nps_80ccd1b","home_loan_interest_24b","employer_nps_80ccd2","other"],
  "employer_nps_limit_pct":10,
  "hra_exemption":true
}','published',false,'Seed: verify against Income Tax calculator Rule.txt','2025-04-01','2026-03-31','Unverified seed');
