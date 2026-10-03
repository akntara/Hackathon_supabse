-- =============================================================================
-- AI topic grouping
--
-- When a question is created, the app embeds its text and calls
-- assign_question_group. That function searches other question embeddings in
-- the same event with pgvector. If cosine similarity is at least the event's
-- similarity_threshold, the question joins that topic. Otherwise it creates a
-- new AI topic. Original question rows are kept.
-- =============================================================================

create extension if not exists vector with schema extensions;


-- -----------------------------------------------------------------------------
-- Events: per-event match threshold (cosine similarity, higher = stricter)
-- -----------------------------------------------------------------------------

alter table public.events
  add column similarity_threshold real not null default 0.82
  constraint events_similarity_threshold_range
    check (similarity_threshold > 0 and similarity_threshold <= 1);

comment on column public.events.similarity_threshold is
  'Minimum cosine similarity for attaching a new question to an existing AI topic.';


-- -----------------------------------------------------------------------------
-- question_groups: organizer topics stay "manual"; model topics are "ai"
-- -----------------------------------------------------------------------------

alter table public.question_groups
  add column kind text not null default 'manual'
  constraint question_groups_kind_check check (kind in ('manual', 'ai'));

comment on column public.question_groups.kind is
  'manual = organizer-defined section; ai = topic created from question embeddings.';

-- AI topics may share a label ("Pricing" twice). Manual sections stay unique.
drop index if exists public.question_groups_event_name_key;

create unique index question_groups_event_name_key
  on public.question_groups (event_id, lower(name))
  where kind = 'manual';


-- -----------------------------------------------------------------------------
-- Embeddings (one per question, text-embedding-3-small / 1536 dims)
-- Not readable by clients; only assign_question_group writes them.
-- -----------------------------------------------------------------------------

create table public.question_embeddings (
  question_id  uuid primary key references public.questions (id) on delete cascade,
  event_id     uuid not null references public.events (id) on delete cascade,
  embedding    extensions.vector(1536) not null,
  created_at   timestamptz not null default now()
);

create index question_embeddings_event_idx on public.question_embeddings (event_id);

create index question_embeddings_cosine_idx
  on public.question_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.question_embeddings enable row level security;


-- -----------------------------------------------------------------------------
-- Assign a question to an AI topic.
-- Threshold is read from the event so callers cannot loosen it.
-- -----------------------------------------------------------------------------

create function public.assign_question_group(
  p_question_id uuid,
  p_embedding extensions.vector,
  p_topic_name text
)
returns table (
  group_id uuid,
  group_name text,
  created boolean,
  similarity real
)
language plpgsql
volatile
security definer
set search_path = extensions, pg_catalog
as $$
declare
  v_question public.questions%rowtype;
  v_threshold real;
  v_embedding extensions.vector;
  v_match_group uuid;
  v_similarity real;
  v_name text;
  v_group_id uuid;
begin
  if p_embedding is null or vector_dims(p_embedding) <> 1536 then
    raise exception 'Expected a 1536-dimension embedding.' using errcode = '22023';
  end if;

  select * into v_question
    from public.questions
   where id = p_question_id;

  if not found then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;

  if v_question.author_id is distinct from auth.uid()
     and not public.is_event_organizer(v_question.event_id) then
    raise exception 'Not allowed to group this question.' using errcode = '42501';
  end if;

  -- Serialize grouping within one event so two similar questions cannot both
  -- miss each other and create duplicate topics.
  perform pg_advisory_xact_lock(hashtext(v_question.event_id::text));

  select * into v_question
    from public.questions
   where id = p_question_id;

  if exists (
    select 1 from public.question_embeddings e where e.question_id = p_question_id
  ) and v_question.group_id is not null then
    select g.name into v_name
      from public.question_groups g
     where g.id = v_question.group_id;

    group_id := v_question.group_id;
    group_name := coalesce(v_name, 'Topic');
    created := false;
    similarity := null;
    return next;
    return;
  end if;

  insert into public.question_embeddings (question_id, event_id, embedding)
  values (p_question_id, v_question.event_id, p_embedding)
  on conflict (question_id) do update
    set embedding = excluded.embedding;

  select e.embedding into v_embedding
    from public.question_embeddings e
   where e.question_id = p_question_id;

  select e.similarity_threshold into v_threshold
    from public.events e
   where e.id = v_question.event_id;

  if v_threshold is null or v_threshold <= 0 or v_threshold > 1 then
    v_threshold := 0.82;
  end if;

  select q.group_id,
         (1 - (emb.embedding <=> v_embedding))::real
    into v_match_group, v_similarity
    from public.question_embeddings emb
    join public.questions q on q.id = emb.question_id
    join public.question_groups g on g.id = q.group_id and g.event_id = q.event_id
   where emb.event_id = v_question.event_id
     and emb.question_id <> p_question_id
     and q.group_id is not null
     and g.kind = 'ai'
   order by emb.embedding <=> v_embedding
   limit 1;

  if v_match_group is not null and v_similarity >= v_threshold then
    update public.questions
       set group_id = v_match_group
     where id = p_question_id;

    select g.name into v_name
      from public.question_groups g
     where g.id = v_match_group;

    group_id := v_match_group;
    group_name := v_name;
    created := false;
    similarity := v_similarity;
    return next;
    return;
  end if;

  v_name := btrim(regexp_replace(coalesce(p_topic_name, ''), '[[:space:]]+', ' ', 'g'));
  v_name := btrim(v_name, '"''.');
  v_name := left(v_name, 60);
  if char_length(v_name) < 1 then
    v_name := 'General';
  end if;

  insert into public.question_groups (event_id, name, kind, position)
  values (v_question.event_id, v_name, 'ai', 0)
  returning id into v_group_id;

  update public.questions
     set group_id = v_group_id
   where id = p_question_id;

  group_id := v_group_id;
  group_name := v_name;
  created := true;
  similarity := v_similarity;
  return next;
end;
$$;

revoke all on function public.assign_question_group(uuid, extensions.vector, text) from public;
revoke all on function public.assign_question_group(uuid, extensions.vector, text) from anon;
grant execute on function public.assign_question_group(uuid, extensions.vector, text) to authenticated;
