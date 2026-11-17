-- Q&A import: allow source 'import', keep the original order of imported questions, expose the order to employees.
alter table faqs drop constraint if exists faqs_source_check;
alter table faqs add constraint faqs_source_check check (source in ('ai','admin','knowledge_gap','import'));
alter table faqs add column if not exists sort_order int;

create or replace view public_faqs as
  select f.id, f.policy_id, p.name as policy_name, p.category, f.question, f.short_answer, f.detailed_answer,
         f.section, f.related_questions, f.view_count, f.updated_at, f.sort_order, f.source
  from faqs f join policies p on p.id = f.policy_id and p.status = 'active'
  where f.status = 'approved';
