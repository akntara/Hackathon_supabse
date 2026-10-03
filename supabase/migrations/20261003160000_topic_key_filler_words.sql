-- =============================================================================
-- Topic names match regardless of filler words
--
-- "Getting started with AI" and "Getting started in AI" had different keys, so
-- the labeller could start a second topic for the same subject. topic_key now
-- drops filler words; existing duplicates are merged into the oldest group.
-- The word list must match FILLER_WORDS in src/lib/topic-groups.ts.
--
-- Requires 20261003150000_dedupe_topic_groups.sql.
-- =============================================================================

drop index if exists public.question_groups_ai_name_key;

create or replace function public.topic_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  with words as (
    select w, i
      from unnest(regexp_split_to_array(
             btrim(regexp_replace(replace(lower(coalesce(p_name, '')), '&', ' and '), '[^[:alnum:]]+', ' ', 'g')),
             ' '
           )) with ordinality as t(w, i)
     where w <> ''
  )
  select coalesce(
    (select string_agg(w, ' ' order by i)
       from words
      where w <> all (array[
        'a', 'an', 'the', 'and', 'or', 'with', 'in', 'into', 'for', 'of', 'on', 'to',
        'about', 'at', 'from', 'by', 'my', 'your', 'our'
      ])),
    (select string_agg(w, ' ' order by i) from words),
    ''
  );
$$;

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
