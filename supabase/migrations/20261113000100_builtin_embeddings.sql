-- Switch to Supabase's built-in gte-small embeddings (384 dimensions). No external AI key.
-- Safe to run once on top of 20261113000000_peoplehub.sql. Existing embeddings are cleared;
-- re-run indexing from Document Management > Review for anything already uploaded.

drop index if exists document_embeddings_hnsw;
drop index if exists faqs_embedding_hnsw;
delete from document_embeddings;
update faqs set embedding = null;
update unanswered_queries set embedding = null;

alter table document_embeddings alter column embedding type vector(384);
alter table faqs alter column embedding type vector(384);
alter table unanswered_queries alter column embedding type vector(384);

create index document_embeddings_hnsw on document_embeddings using hnsw (embedding vector_cosine_ops);
create index faqs_embedding_hnsw on faqs using hnsw (embedding vector_cosine_ops);

drop function if exists match_policy_chunks(vector, int, uuid);
drop function if exists match_faqs(vector, int);
drop function if exists match_unanswered(vector, float);

create function match_policy_chunks(query_embedding vector(384), match_count int default 8, filter_policy uuid default null)
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

create function match_faqs(query_embedding vector(384), match_count int default 4)
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

create function match_unanswered(query_embedding vector(384), threshold float default 0.9)
returns table (id uuid, similarity float)
language sql stable as $$
  select u.id, 1 - (u.embedding <=> query_embedding) as similarity
  from unanswered_queries u
  where u.embedding is not null and u.status = 'needs_review'
    and 1 - (u.embedding <=> query_embedding) >= threshold
  order by u.embedding <=> query_embedding limit 1;
$$;

revoke execute on function match_policy_chunks(vector, int, uuid) from anon, authenticated, public;
revoke execute on function match_faqs(vector, int) from anon, authenticated, public;
revoke execute on function match_unanswered(vector, float) from anon, authenticated, public;

-- gte-small scores run higher than OpenAI embeddings; tune in Admin > Settings if needed.
update system_settings set value = '{"high":0.86,"medium":0.81}' where key = 'confidence_thresholds';
