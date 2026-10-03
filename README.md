# AskLive — live audience Q&A

Next.js (App Router, TypeScript, Tailwind) + Supabase (Postgres, Auth, Realtime).

- **Organizers** sign up with email/password, create events, and moderate questions live
  (pin "now answering", mark answered, hide, delete, open/close submissions).
- **Attendees** open `/e/<code>` — no sign-up. They are signed in silently with
  Supabase **anonymous auth**, so questions and votes are tied to a stable user id
  and protected by row-level security.
- **Present mode** at `/e/<code>/present` is a full-screen view for projecting.

## Setup

1. Create a Supabase project.
2. **Run the schema:** paste `supabase/migrations/20261003000000_init.sql` into the
   SQL editor (or `supabase db push` with the CLI).
3. **Enable anonymous sign-ins:** Dashboard → Authentication → Sign In / Providers →
   *Allow anonymous sign-ins*. (Recommended: enable CAPTCHA / rate limits for production.)
4. **Auth URLs:** Authentication → URL Configuration → set Site URL to your app URL and add
   `http://localhost:3000/auth/callback` (and your production callback) to Redirect URLs.
   For quick local testing you can disable "Confirm email".
5. Copy env vars:

   ```bash
   cp .env.example .env.local
   # fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY)
   ```

6. Run:

   ```bash
   npm install
   npm run dev
   ```

## Architecture

| Path | Purpose |
| --- | --- |
| `src/proxy.ts` | Refreshes Supabase session cookies; guards `/dashboard` for non-anonymous users |
| `src/app/dashboard` | Organizer event list, create form, moderation console |
| `src/app/e/[code]` | Public attendee room and present view |
| `src/lib/use-live-event.ts` | Realtime subscription (Postgres changes + broadcast) |
| `supabase/migrations` | Schema, RLS policies, triggers, Realtime publication |

### Schema

| Table | Purpose |
| --- | --- |
| `events` | Owned by an organizer; `code` is the public identifier |
| `event_participants` | Who has joined an event via its code (the gate for attendee access) |
| `question_groups` | Organizer-defined topics within an event |
| `questions` | Attendee questions; optional `group_id` (same-event enforced by composite FK) |
| `question_votes` | One vote per user per question |

All tables have `created_at`; mutable ones have `updated_at` maintained by triggers.

### Security model (enforced in Postgres)

- Events are **not** publicly listable. Attendees resolve an event only through its public
  code: `join_event(code)` records membership, and every attendee RLS policy is scoped to
  joined events. `get_event_by_code(code)` returns public details without joining.
- Only permanent (non-anonymous) users can create events; only the owner can update/delete
  events, manage groups and moderate questions. `code` and `organizer_id` are immutable.
- Attendees ask with `submit_question(code, body, name?, group_id?)` and vote with
  `toggle_vote(question_id)`. Both run as the caller, so RLS still applies.
- Triggers force `status`, `is_pinned`, `upvotes`, `author_id` on insert, lock `body` and
  `author_id` on update, and rate-limit each attendee to one question per 10 seconds per event.
- Hidden questions are visible only to the organizer and the author; only live questions can
  be voted on. `upvotes` can only change via the vote-sync trigger.
- A partial unique index guarantees at most one pinned question per event.

### Realtime

Clients subscribe to `postgres_changes` on `questions` (filtered by event) and `events`.
Because Realtime respects RLS, attendees never receive an UPDATE for a question that becomes
hidden — so the organizer console also sends a `question_removed` broadcast on the event
channel when a question is hidden or deleted. On reconnect, clients refetch to catch up.

## AI question clustering (Supabase Edge Function)

Similar questions are clustered by the `group-question` Edge Function
(`supabase/functions/group-question/index.ts`). It embeds the question with OpenAI,
then calls `assign_question_group`, which uses pgvector to attach it to the closest
AI topic (or start a new one) and stores the similarity index. It runs with the
caller's JWT, so database permissions still apply.

Deploy with the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set OPENAI_API_KEY=sk-...
npx supabase functions deploy group-question --no-verify-jwt
```

Or in the dashboard: Edge Functions → Deploy a new function → name it `group-question`,
paste `index.ts`, turn off "Verify JWT", and add `OPENAI_API_KEY` under Edge Functions → Secrets.

Until the function is deployed, the app falls back to the Next.js route
`/api/questions/group`. Set `NEXT_PUBLIC_CLUSTERING_BACKEND=api` to always use the route.
