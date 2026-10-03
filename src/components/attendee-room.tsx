"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestQuestionGroup } from "@/lib/group-question-client";
import { createClient } from "@/lib/supabase/client";
import type { PublicEvent, QuestionRow } from "@/lib/types";
import { useJoinEvent } from "@/lib/use-join-event";
import { useLiveEvent } from "@/lib/use-live-event";
import { sortQuestions, type SortMode } from "@/lib/utils";
import { ChatIcon, TrashIcon } from "./icons";
import { QuestionCard, useNow } from "./question-card";
import {
  Button,
  Card,
  EmptyState,
  Input,
  LiveIndicator,
  Logo,
  SegmentedControl,
  Spinner,
  Textarea,
} from "./ui";

const MAX_LENGTH = 500;
const NAME_KEY = "asklive:name";

type Tab = "live" | "answered";

export function AttendeeRoom({ event: initialEvent }: { event: PublicEvent }) {
  const supabase = createClient();
  const now = useNow();
  const { userId, error: authError } = useJoinEvent(initialEvent.code);

  const { event, questions, loading, connection, upsert, remove } = useLiveEvent({
    event: initialEvent,
    enabled: !!userId,
  });

  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("question_votes")
      .select("question_id")
      .eq("event_id", initialEvent.id)
      .eq("user_id", userId)
      .then(({ data }) => {
        if (data) setMyVotes(new Set(data.map((v) => v.question_id)));
      });
  }, [supabase, userId, initialEvent.id]);

  const [tab, setTab] = useState<Tab>("live");
  const [sort, setSort] = useState<SortMode>("top");

  const live = useMemo(() => questions.filter((q) => q.status === "live"), [questions]);
  const answered = useMemo(() => questions.filter((q) => q.status === "answered"), [questions]);
  const pinned = live.find((q) => q.is_pinned);
  const list = useMemo(
    () =>
      tab === "live"
        ? sortQuestions(live, sort)
        : [...answered].sort((a, b) => (b.answered_at ?? "").localeCompare(a.answered_at ?? "")),
    [tab, live, answered, sort],
  );

  const toggleVote = useCallback(
    async (q: QuestionRow) => {
      if (!userId) return;
      const hasVoted = myVotes.has(q.id);
      const nextVotes = new Set(myVotes);
      if (hasVoted) nextVotes.delete(q.id);
      else nextVotes.add(q.id);
      setMyVotes(nextVotes);
      upsert({ ...q, upvotes: Math.max(0, q.upvotes + (hasVoted ? -1 : 1)) });

      const { data, error } = await supabase
        .rpc("toggle_vote", { p_question_id: q.id })
        .single();

      if (error || !data) {
        setMyVotes(myVotes);
        upsert(q);
        return;
      }
      setMyVotes((prev) => {
        const next = new Set(prev);
        if (data.voted) next.add(q.id);
        else next.delete(q.id);
        return next;
      });
    },
    [myVotes, supabase, upsert, userId],
  );

  async function deleteOwn(q: QuestionRow) {
    if (!confirm("Delete your question?")) return;
    remove(q.id);
    const { error } = await supabase.from("questions").delete().eq("id", q.id);
    if (error) upsert(q);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-violet-100 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo className="text-sm" />
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
              #{event.code}
            </span>
            <LiveIndicator state={userId ? connection : "connecting"} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="bg-brand relative overflow-hidden rounded-3xl p-6 text-white shadow-xl shadow-fuchsia-500/20 sm:p-8">
          <div aria-hidden className="bg-dots absolute inset-0" />
          <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-amber-300/40 blur-2xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Live Q&amp;A</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{event.title}</h1>
            {event.description && <p className="mt-2 max-w-xl text-white/85">{event.description}</p>}
          </div>
        </div>

        {authError ? (
          <Card className="p-5 text-sm text-rose-700">
            <p className="font-medium">We couldn&apos;t connect you to this event.</p>
            <p className="mt-1 text-rose-600">{authError}</p>
          </Card>
        ) : (
          <AskForm event={event} ready={!!userId} onAsked={upsert} />
        )}

        {pinned && tab === "live" && (
          <div className="bg-brand rounded-2xl p-1 shadow-xl shadow-fuchsia-500/20">
            <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-white/90">
              Now answering
            </p>
            <QuestionCard
              question={pinned}
              now={now}
              voted={myVotes.has(pinned.id)}
              onVote={() => toggleVote(pinned)}
              isMine={pinned.author_id === userId}
            />
          </div>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl
              value={tab}
              onChange={setTab}
              options={[
                { value: "live", label: `Questions (${live.length})` },
                { value: "answered", label: `Answered (${answered.length})` },
              ]}
            />
            {tab === "live" && (
              <SegmentedControl
                value={sort}
                onChange={setSort}
                options={[
                  { value: "top", label: "Top" },
                  { value: "recent", label: "Recent" },
                ]}
              />
            )}
          </div>

          {loading || !userId ? (
            !authError && (
              <div className="flex justify-center py-16 text-slate-400">
                <Spinner className="size-6" />
              </div>
            )
          ) : list.filter((q) => !(tab === "live" && q.is_pinned)).length === 0 ? (
            <EmptyState
              icon={<ChatIcon className="size-8" />}
              title={tab === "live" ? "No questions yet" : "Nothing answered yet"}
              description={
                tab === "live" ? "Be the first to ask — others can upvote your question." : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {list
                .filter((q) => !(tab === "live" && q.is_pinned))
                .map((q) => {
                  const mine = q.author_id === userId;
                  return (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      now={now}
                      voted={myVotes.has(q.id)}
                      onVote={() => toggleVote(q)}
                      isMine={mine}
                      actions={
                        mine && q.status === "live" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteOwn(q)}
                            aria-label="Delete your question"
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        ) : undefined
                      }
                    />
                  );
                })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function AskForm({
  event,
  ready,
  onAsked,
}: {
  event: PublicEvent;
  ready: boolean;
  onAsked: (q: QuestionRow) => void;
}) {
  const supabase = createClient();
  const [body, setBody] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmed = body.trim();
  const canSubmit = ready && event.is_open && trimmed.length >= 3 && trimmed.length <= MAX_LENGTH;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const name = nameRef.current?.value.trim() ?? "";
    localStorage.setItem(NAME_KEY, name);

    const { data, error } = await supabase.rpc("submit_question", {
      p_event_code: event.code,
      p_body: trimmed,
      p_author_name: name || null,
    });

    setPending(false);
    if (error) {
      setError(
        error.code === "42501"
          ? "This event is no longer accepting questions."
          : error.message,
      );
      return;
    }
    onAsked(data);
    void requestQuestionGroup(data.id);
    setBody("");
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  }

  if (!event.is_open) {
    return (
      <Card className="p-5 text-center">
        <p className="font-medium text-slate-900">Questions are closed</p>
        <p className="mt-1 text-sm text-slate-500">
          The host has paused new questions. You can still browse and follow along.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit} className="space-y-3">
        <Textarea
          aria-label="Your question"
          placeholder="Ask a question…"
          rows={3}
          maxLength={MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          className="text-base"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            aria-label="Your name (optional)"
            placeholder="Your name (optional)"
            maxLength={60}
            ref={(el) => {
              nameRef.current = el;
              if (el && !el.value) el.value = localStorage.getItem(NAME_KEY) ?? "";
            }}
            className="sm:max-w-56"
          />
          <div className="flex flex-1 items-center justify-end gap-3">
            <span
              className={`text-xs tabular-nums ${
                body.length > MAX_LENGTH - 50 ? "text-amber-600" : "text-slate-400"
              }`}
            >
              {body.length}/{MAX_LENGTH}
            </span>
            <Button type="submit" disabled={!canSubmit} loading={pending}>
              {sent ? "Sent!" : "Ask question"}
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
