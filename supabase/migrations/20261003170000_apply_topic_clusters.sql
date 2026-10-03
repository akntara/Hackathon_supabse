-- =============================================================================
-- Re-cluster an event's AI topics in one pass
--
-- Questions are grouped one at a time as they arrive, so two similar questions
-- asked at the same moment can start separate topics. The organizer console
-- can ask the model to cluster every question at once and apply the result
-- here: each cluster reuses the existing topic with the same name, or the topic
-- most of its questions already belong to, so topic ids (and colours) stay
-- stable. AI topics left empty are removed. Manual sections are not touched.
--
-- p_clusters: [{ "name": "Event logistics", "question_ids": ["<uuid>", ...] }]
-- Cluster names must be distinct by public.topic_key.
--
-- Requires 20261003160000_topic_key_filler_words.sql.
-- =============================================================================

create function public.apply_topic_clusters(
  p_event_id uuid,
  p_clusters jsonb
)
returns table (topics integer, moved integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cluster jsonb;
  v_name text;
  v_ids uuid[];
  v_group_id uuid;
  v_claimed uuid[] := '{}';
  v_moved integer := 0;
  v_count integer;
  v_topics integer := 0;
begin
  if not public.is_event_organizer(p_event_id) then
    raise exception 'Only the organizer can re-cluster topics.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_clusters) is distinct from 'array' then
    raise exception 'Expected an array of clusters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_event_id::text));
  perform set_config('asklive.grouping', 'on', true);

  for v_cluster in select value from jsonb_array_elements(p_clusters)
  loop
    v_name := left(btrim(regexp_replace(coalesce(v_cluster->>'name', ''), '[[:space:]]+', ' ', 'g'), ' "''.'), 60);
    if char_length(v_name) < 1 then
      v_name := 'General';
    end if;

    -- Only questions of this event that are ungrouped or in an AI topic.
    select coalesce(array_agg(q.id), '{}')
      into v_ids
      from public.questions q
      left join public.question_groups g on g.id = q.group_id
     where q.event_id = p_event_id
       and q.id in (
         select (value #>> '{}')::uuid
           from jsonb_array_elements(coalesce(v_cluster->'question_ids', '[]'::jsonb))
          where value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )
       and (q.group_id is null or g.kind = 'ai');

    continue when cardinality(v_ids) = 0;

    select g.id into v_group_id
      from public.question_groups g
     where g.event_id = p_event_id
       and g.kind = 'ai'
       and public.topic_key(g.name) = public.topic_key(v_name)
       and not (g.id = any(v_claimed));

    if v_group_id is null then
      select q.group_id into v_group_id
        from public.questions q
        join public.question_groups g on g.id = q.group_id
       where q.id = any(v_ids)
         and g.kind = 'ai'
         and not (g.id = any(v_claimed))
       group by q.group_id
       order by count(*) desc, min(g.created_at)
       limit 1;

      if v_group_id is not null then
        update public.question_groups
           set name = v_name
         where id = v_group_id;
      else
        insert into public.question_groups (event_id, name, kind, position)
        values (p_event_id, v_name, 'ai', 0)
        returning id into v_group_id;
      end if;
    end if;

    v_claimed := v_claimed || v_group_id;
    v_topics := v_topics + 1;

    update public.questions q
       set group_id = v_group_id,
           similarity = null,
           similar_to_id = null
     where q.id = any(v_ids)
       and q.group_id is distinct from v_group_id;
    get diagnostics v_count = row_count;
    v_moved := v_moved + v_count;
  end loop;

  perform set_config('asklive.grouping', 'off', true);

  delete from public.question_groups g
   where g.event_id = p_event_id
     and g.kind = 'ai'
     and not exists (select 1 from public.questions q where q.group_id = g.id);

  topics := v_topics;
  moved := v_moved;
  return next;
end;
$$;

revoke all on function public.apply_topic_clusters(uuid, jsonb) from public;
revoke all on function public.apply_topic_clusters(uuid, jsonb) from anon;
grant execute on function public.apply_topic_clusters(uuid, jsonb) to authenticated;
