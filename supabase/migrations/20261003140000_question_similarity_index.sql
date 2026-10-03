-- =============================================================================
-- Similarity index
--
-- Stores, for each question that joined an existing AI topic, the cosine
-- similarity to its closest earlier question and which question that was.
-- The UI uses this to show "92% match" and to highlight similar questions so
-- the speaker can answer them together.
--
-- Requires 20261003130000_ai_question_groups.sql.
-- =============================================================================

alter table public.questions
  add column similarity real
    constraint questions_similarity_range check (similarity is null or (similarity >= -1 and similarity <= 1)),
  add column similar_to_id uuid references public.questions (id) on delete set null;

comment on column public.questions.similarity is
  'Cosine similarity to the closest earlier question in the same AI topic (null for the first question of a topic).';
comment on column public.questions.similar_to_id is
  'The question this one was matched to when it joined its AI topic.';

create index questions_similar_to_idx on public.questions (similar_to_id) where similar_to_id is not null;


-- Only assign_question_group may set the similarity fields.
create function public.questions_guard_similarity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('asklive.grouping', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.similarity := null;
      new.similar_to_id := null;
    else
      new.similarity := old.similarity;
      new.similar_to_id := old.similar_to_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger questions_guard_similarity
  before insert or update on public.questions
  for each row execute function public.questions_guard_similarity();


-- Same behaviour as before, plus recording the similarity index.
create or replace function public.assign_question_group(
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
  v_match_question uuid;
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
    similarity := v_question.similarity;
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
         q.id,
         (1 - (emb.embedding <=> v_embedding))::real
    into v_match_group, v_match_question, v_similarity
    from public.question_embeddings emb
    join public.questions q on q.id = emb.question_id
    join public.question_groups g on g.id = q.group_id and g.event_id = q.event_id
   where emb.event_id = v_question.event_id
     and emb.question_id <> p_question_id
     and q.group_id is not null
     and g.kind = 'ai'
   order by emb.embedding <=> v_embedding
   limit 1;

  perform set_config('asklive.grouping', 'on', true);

  if v_match_group is not null and v_similarity >= v_threshold then
    update public.questions
       set group_id = v_match_group,
           similarity = v_similarity,
           similar_to_id = v_match_question
     where id = p_question_id;

    perform set_config('asklive.grouping', 'off', true);

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
     set group_id = v_group_id,
         similarity = null,
         similar_to_id = null
   where id = p_question_id;

  perform set_config('asklive.grouping', 'off', true);

  group_id := v_group_id;
  group_name := v_name;
  created := true;
  similarity := null;
  return next;
end;
$$;

revoke all on function public.assign_question_group(uuid, extensions.vector, text) from public;
revoke all on function public.assign_question_group(uuid, extensions.vector, text) from anon;
grant execute on function public.assign_question_group(uuid, extensions.vector, text) to authenticated;
