-- =============================================================================
-- AskLive — live audience Q&A schema
--
-- Roles
--   Organizer : a permanent (email) Supabase user. Owns events.
--   Attendee  : a Supabase *anonymous* user (auth.signInAnonymously()). Gains
--               access to an event only by joining with its public `code`.
--
-- Access model
--   Events are NOT publicly listable. An attendee resolves an event through its
--   public identifier with `join_event(code)`, which records a row in
--   `event_participants`. Every RLS policy for attendees is scoped to events the
--   caller has joined, so knowing a code is what grants access.
--
-- Requires Postgres 15+ (column list in ON DELETE SET NULL).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

create type public.question_status as enum ('live', 'answered', 'hidden');


-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.is_permanent_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- SECURITY DEFINER so it can check uniqueness across all events, which the
-- caller cannot see under RLS.
create function public.generate_event_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  result text;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.events where code = result);
  end loop;
  return result;
end;
$$;


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- events ----------------------------------------------------------------------
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code          text not null default public.generate_event_code(),
  title         text not null,
  description   text,
  is_open       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint events_code_key unique (code),
  constraint events_code_format check (code ~ '^[a-z0-9]{4,32}$'),
  constraint events_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint events_description_length check (description is null or char_length(description) <= 1000)
);

comment on column public.events.code is 'Public identifier attendees use to join (URL /e/<code>).';

create index events_organizer_created_idx on public.events (organizer_id, created_at desc);


-- event_participants ------------------------------------------------------------
-- Who has joined an event via its public code. Gate for all attendee access.
create table public.event_participants (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  primary key (event_id, user_id)
);

create index event_participants_user_idx on public.event_participants (user_id);
create index event_participants_event_seen_idx on public.event_participants (event_id, last_seen_at desc);


-- question_groups -------------------------------------------------------------
-- Organizer-defined topics/sections within an event (e.g. "Product", "Hiring").
create table public.question_groups (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint question_groups_name_length check (char_length(btrim(name)) between 1 and 60),
  -- Target for the composite FK from questions, guaranteeing same-event groups.
  constraint question_groups_id_event_key unique (id, event_id)
);

create unique index question_groups_event_name_key on public.question_groups (event_id, lower(name));
create index question_groups_event_position_idx on public.question_groups (event_id, position, created_at);


-- questions -------------------------------------------------------------------
create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  group_id     uuid,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name  text,
  body         text not null,
  status       public.question_status not null default 'live',
  is_pinned    boolean not null default false,
  upvotes      integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  answered_at  timestamptz,

  constraint questions_body_length check (char_length(btrim(body)) between 3 and 500),
  constraint questions_author_name_length check (author_name is null or char_length(author_name) <= 60),
  constraint questions_upvotes_nonnegative check (upvotes >= 0),
  constraint questions_id_event_key unique (id, event_id),
  constraint questions_group_fk
    foreign key (group_id, event_id)
    references public.question_groups (id, event_id)
    on delete set null (group_id)
);

-- "Top" feed: live questions ordered by votes, then recency.
create index questions_event_top_idx
  on public.questions (event_id, status, upvotes desc, created_at desc);
-- "Recent" feed and initial load.
create index questions_event_recent_idx
  on public.questions (event_id, created_at desc);
-- Filtering by group.
create index questions_event_group_idx
  on public.questions (event_id, group_id)
  where group_id is not null;
-- Per-author rate limiting and "my questions".
create index questions_author_event_idx
  on public.questions (author_id, event_id, created_at desc);
-- At most one pinned ("now answering") question per event.
create unique index questions_one_pinned_per_event
  on public.questions (event_id)
  where is_pinned;


-- question_votes --------------------------------------------------------------
create table public.question_votes (
  question_id  uuid not null,
  event_id     uuid not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),

  primary key (question_id, user_id),
  constraint question_votes_question_fk
    foreign key (question_id, event_id)
    references public.questions (id, event_id)
    on delete cascade
);

-- "Which questions in this event have I voted on?"
create index question_votes_event_user_idx on public.question_votes (event_id, user_id);
create index question_votes_user_idx on public.question_votes (user_id);


-- -----------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER to avoid recursive RLS evaluation)
-- -----------------------------------------------------------------------------

create function public.is_event_organizer(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events
     where id = p_event_id and organizer_id = auth.uid()
  );
$$;

create function public.is_event_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants
     where event_id = p_event_id and user_id = auth.uid()
  ) or public.is_event_organizer(p_event_id);
$$;

create function public.is_event_open(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_open from public.events where id = p_event_id), false);
$$;


-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger question_groups_set_updated_at
  before update on public.question_groups
  for each row execute function public.set_updated_at();

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();


-- Event code and owner are immutable once created.
create function public.events_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.code := old.code;
  new.organizer_id := old.organizer_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger events_before_update
  before update on public.events
  for each row execute function public.events_before_update();


-- Attendees cannot forge moderation fields; rate-limit submissions.
create function public.questions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.questions
     where author_id = auth.uid()
       and event_id = new.event_id
       and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Please wait a few seconds before asking another question.'
      using errcode = 'P0001';
  end if;

  new.author_id   := auth.uid();
  new.status      := 'live';
  new.is_pinned   := false;
  new.upvotes     := 0;
  new.answered_at := null;
  new.created_at  := now();
  new.updated_at  := now();
  new.body        := btrim(new.body);
  new.author_name := nullif(btrim(coalesce(new.author_name, '')), '');
  return new;
end;
$$;

create trigger questions_before_insert
  before insert on public.questions
  for each row execute function public.questions_before_insert();


-- Moderation rules. SECURITY DEFINER so pinning can unpin sibling rows.
create function public.questions_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Immutable fields.
  new.id         := old.id;
  new.event_id   := old.event_id;
  new.author_id  := old.author_id;
  new.body       := old.body;
  new.created_at := old.created_at;

  -- Only the vote-sync trigger may change the counter.
  if coalesce(current_setting('asklive.syncing_votes', true), '') <> 'on' then
    new.upvotes := old.upvotes;
  end if;

  if new.status = 'answered' and old.status <> 'answered' then
    new.answered_at := now();
  elsif new.status <> 'answered' then
    new.answered_at := null;
  end if;

  if new.status <> 'live' then
    new.is_pinned := false;
  end if;

  if new.is_pinned and not old.is_pinned then
    update public.questions
       set is_pinned = false
     where event_id = new.event_id and id <> new.id and is_pinned;
  end if;

  return new;
end;
$$;

create trigger questions_before_update
  before update on public.questions
  for each row execute function public.questions_before_update();


-- Votes: derive event_id from the question and bind to the caller.
create function public.question_votes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.event_id := (select q.event_id from public.questions q where q.id = new.question_id);
  return new;
end;
$$;

create trigger question_votes_before_insert
  before insert on public.question_votes
  for each row execute function public.question_votes_before_insert();


-- Keep questions.upvotes in sync (voters cannot update questions directly).
create function public.question_votes_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('asklive.syncing_votes', 'on', true);
  if tg_op = 'INSERT' then
    update public.questions set upvotes = upvotes + 1 where id = new.question_id;
  else
    update public.questions set upvotes = greatest(upvotes - 1, 0) where id = old.question_id;
  end if;
  perform set_config('asklive.syncing_votes', 'off', true);
  return null;
end;
$$;

create trigger question_votes_sync
  after insert or delete on public.question_votes
  for each row execute function public.question_votes_sync();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.events             enable row level security;
alter table public.event_participants enable row level security;
alter table public.question_groups    enable row level security;
alter table public.questions          enable row level security;
alter table public.question_votes     enable row level security;


-- events ------------------------------------------------------------------------
create policy "organizers and participants read events"
  on public.events for select
  to authenticated
  using (organizer_id = auth.uid() or public.is_event_participant(id));

create policy "organizers create events"
  on public.events for insert
  to authenticated
  with check (public.is_permanent_user() and organizer_id = auth.uid());

create policy "organizers update own events"
  on public.events for update
  to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

create policy "organizers delete own events"
  on public.events for delete
  to authenticated
  using (organizer_id = auth.uid());


-- event_participants --------------------------------------------------------------
-- Rows are created only through join_event(code).
create policy "read own membership or organizer roster"
  on public.event_participants for select
  to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "leave event or organizer removes participant"
  on public.event_participants for delete
  to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));


-- question_groups -----------------------------------------------------------------
create policy "participants read groups"
  on public.question_groups for select
  to authenticated
  using (public.is_event_participant(event_id));

create policy "organizers create groups"
  on public.question_groups for insert
  to authenticated
  with check (public.is_event_organizer(event_id));

create policy "organizers update groups"
  on public.question_groups for update
  to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

create policy "organizers delete groups"
  on public.question_groups for delete
  to authenticated
  using (public.is_event_organizer(event_id));


-- questions -------------------------------------------------------------------------
create policy "participants read visible questions"
  on public.questions for select
  to authenticated
  using (
    public.is_event_organizer(event_id)
    or (
      public.is_event_participant(event_id)
      and (status <> 'hidden' or author_id = auth.uid())
    )
  );

create policy "participants ask in open events"
  on public.questions for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_event_participant(event_id)
    and public.is_event_open(event_id)
  );

create policy "organizers moderate questions"
  on public.questions for update
  to authenticated
  using (public.is_event_organizer(event_id))
  with check (public.is_event_organizer(event_id));

create policy "authors or organizers delete questions"
  on public.questions for delete
  to authenticated
  using (author_id = auth.uid() or public.is_event_organizer(event_id));


-- question_votes ------------------------------------------------------------------
create policy "read own votes or organizer reads all"
  on public.question_votes for select
  to authenticated
  using (user_id = auth.uid() or public.is_event_organizer(event_id));

create policy "participants vote on live questions"
  on public.question_votes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_event_participant(event_id)
    and exists (
      select 1 from public.questions q
       where q.id = question_id and q.event_id = question_votes.event_id and q.status = 'live'
    )
  );

create policy "users remove own votes"
  on public.question_votes for delete
  to authenticated
  using (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Public-identifier RPCs
-- -----------------------------------------------------------------------------

-- Look up an event's public details by code (no membership created).
-- Callable without a session, e.g. for server-rendered page metadata.
create function public.get_event_by_code(p_code text)
returns table (
  id uuid,
  code text,
  title text,
  description text,
  is_open boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.code, e.title, e.description, e.is_open, e.created_at
    from public.events e
   where e.code = lower(btrim(p_code));
$$;

-- Join an event by its public code. Idempotent; refreshes last_seen_at.
create function public.join_event(p_code text)
returns table (
  id uuid,
  code text,
  title text,
  description text,
  is_open boolean,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign-in required to join an event.' using errcode = '28000';
  end if;

  select e.* into v_event from public.events e where e.code = lower(btrim(p_code));
  if not found then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;

  insert into public.event_participants as p (event_id, user_id)
  values (v_event.id, auth.uid())
  on conflict (event_id, user_id) do update set last_seen_at = now();

  return query
    select v_event.id, v_event.code, v_event.title, v_event.description, v_event.is_open, v_event.created_at;
end;
$$;

-- Submit a question to an event identified by its public code.
-- SECURITY INVOKER: the insert is still subject to RLS and triggers.
create function public.submit_question(
  p_event_code   text,
  p_body         text,
  p_author_name  text default null,
  p_group_id     uuid default null
)
returns public.questions
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_question public.questions%rowtype;
begin
  select j.id into v_event_id from public.join_event(p_event_code) j;

  insert into public.questions (event_id, body, author_name, group_id)
  values (v_event_id, p_body, p_author_name, p_group_id)
  returning * into v_question;

  return v_question;
end;
$$;

-- Toggle the caller's upvote on a question. SECURITY INVOKER (RLS applies).
create function public.toggle_vote(p_question_id uuid)
returns table (voted boolean, upvotes integer)
language plpgsql
volatile
set search_path = ''
as $$
begin
  delete from public.question_votes v
   where v.question_id = p_question_id and v.user_id = auth.uid();

  if found then
    voted := false;
  else
    insert into public.question_votes (question_id) values (p_question_id);
    voted := true;
  end if;

  select q.upvotes into upvotes from public.questions q where q.id = p_question_id;
  return next;
end;
$$;


-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------

revoke execute on function public.join_event(text) from public, anon;
revoke execute on function public.submit_question(text, text, text, uuid) from public, anon;
revoke execute on function public.toggle_vote(uuid) from public, anon;
revoke execute on function public.generate_event_code() from public, anon;

grant execute on function public.get_event_by_code(text) to anon, authenticated;
grant execute on function public.join_event(text) to authenticated;
grant execute on function public.submit_question(text, text, text, uuid) to authenticated;
grant execute on function public.toggle_vote(uuid) to authenticated;
grant execute on function public.generate_event_code() to authenticated;


-- -----------------------------------------------------------------------------
-- Realtime (postgres_changes respects the RLS policies above)
-- -----------------------------------------------------------------------------

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.questions;
alter publication supabase_realtime add table public.question_groups;
