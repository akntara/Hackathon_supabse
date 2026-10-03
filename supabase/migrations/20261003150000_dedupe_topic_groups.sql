-- =============================================================================
-- One AI topic per name
--
-- A question whose similarity falls below the event threshold used to start a
-- new group even when the topic labeller returned a name that already existed,
-- so the same topic could appear twice. This merges existing duplicates, makes
-- assign_question_group reuse a same-name topic, and enforces it with an index.
--
-- Requires 20261003140000_question_similarity_index.sql.
-- =============================================================================

create function public.topic_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(replace(lower(coalesce(p_name, '')), '&', ' and '), '[^[:alnum:]]+', ' ', 'g'));
$$;


-- Merge existing duplicates into the oldest group of each name.
update public.questions q
   set group_id = d.keep_id
  from (
    select id,
           first_value(id) over (
             partition by event_id, public.topic_key(name)
             order by created_at, id
           ) as keep_id
      from public.question_groups
     where kind = 'ai'
  ) d
 where q.group_id = d.id
   and d.id <> d.keep_id;

delete from public.question_groups g
 where g.kind = 'ai'
   and exists (
     select 1
       from public.question_groups k
      where k.event_id = g.event_id
        and k.kind = 'ai'
        and public.topic_key(k.name) = public.topic_key(g.name)
        and (k.created_at, k.id) < (g.created_at, g.id)
   );

create unique index question_groups_ai_name_key
  on public.question_groups (event_id, public.topic_key(name))
  where kind = 'ai';


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

  -- Below the threshold, a topic with the same name as the label still counts.
  if v_match_group is null or v_similarity < v_threshold then
    v_name := btrim(regexp_replace(coalesce(p_topic_name, ''), '[[:space:]]+', ' ', 'g'));
    v_name := btrim(v_name, '"''.');
    v_name := left(v_name, 60);
    if char_length(v_name) < 1 then
      v_name := 'General';
    end if;

    select g.id into v_group_id
      from public.question_groups g
     where g.event_id = v_question.event_id
       and g.kind = 'ai'
       and public.topic_key(g.name) = public.topic_key(v_name);

    if v_group_id is not null then
      v_match_group := v_group_id;
      select q.id, (1 - (emb.embedding <=> v_embedding))::real
        into v_match_question, v_similarity
        from public.question_embeddings emb
        join public.questions q on q.id = emb.question_id
       where q.group_id = v_group_id
         and emb.question_id <> p_question_id
       order by emb.embedding <=> v_embedding
       limit 1;
    else
      v_match_group := null;
    end if;
  end if;

  perform set_config('asklive.grouping', 'on', true);

  if v_match_group is not null then
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
