"use client";

import { useMemo } from "react";
import { buildTopicGroups, similarLiveQuestions, type TopicCluster } from "@/lib/topic-groups";
import type { PublicEvent, QuestionRow } from "@/lib/types";
import { useJoinEvent } from "@/lib/use-join-event";
import { useLiveEvent } from "@/lib/use-live-event";
import { sortQuestions } from "@/lib/utils";
import { ArrowUpIcon } from "./icons";
import { EventQr, useAttendeeUrl } from "./event-qr";
import { TopicMap } from "./topic-map";
import { LiveIndicator } from "./ui";

export function PresentView({
  event: initialEvent,
  shareOrigin,
}: {
  event: PublicEvent;
  shareOrigin?: string | null;
}) {
  const { userId } = useJoinEvent(initialEvent.code);
  const { event, questions, groups, connection } = useLiveEvent({
    event: initialEvent,
    enabled: !!userId,
  });
  const attendeeUrl = useAttendeeUrl(initialEvent.code, shareOrigin);

  const live = useMemo(
    () => sortQuestions(questions.filter((q) => q.status === "live"), "top"),
    [questions],
  );
  const pinned = live.find((q) => q.is_pinned);
  const together = useMemo(() => similarLiveQuestions(pinned, questions), [pinned, questions]);
  const { topics } = useMemo(() => buildTopicGroups(questions, groups), [questions, groups]);
  const topicName = pinned?.group_id ? groups.find((g) => g.id === pinned.group_id)?.name : undefined;

  // One row per topic so near-duplicates don't crowd the list.
  const upNext = useMemo(() => {
    const { topics } = buildTopicGroups(live, groups);
    const byTopic = new Map(topics.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const rows: Array<{ question: QuestionRow; count: number; votes: number; topic?: TopicCluster }> = [];
    for (const q of live) {
      if (q.is_pinned || (pinned?.group_id && q.group_id === pinned.group_id)) continue;
      const topic = q.group_id ? byTopic.get(q.group_id) : undefined;
      if (topic) {
        if (seen.has(topic.id)) continue;
        seen.add(topic.id);
        rows.push({
          question: topic.representative ?? q,
          count: topic.live.length,
          votes: topic.live.reduce((sum, item) => sum + item.upvotes, 0),
          topic,
        });
      } else {
        rows.push({ question: q, count: 1, votes: q.upvotes });
      }
    }
    return rows.sort((a, b) => b.votes - a.votes || b.count - a.count).slice(0, 5);
  }, [live, groups, pinned]);

  return (
    <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden bg-linear-to-br from-slate-950 via-violet-950 to-fuchsia-950 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 size-[32rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute -right-20 -top-20 size-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 size-96 rounded-full bg-orange-500/15 blur-3xl" />
      </div>
      <header className="relative flex items-center justify-between border-b border-white/10 px-10 py-6">
        <div>
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <div className="mt-1 [&_span]:text-slate-400">
            <LiveIndicator state={connection} />
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-sm text-slate-400">Scan or go to</p>
            <p className="font-medium text-white">{attendeeUrl.replace(/^https?:\/\//, "")}</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-gradient-light">{event.code}</p>
          </div>
          <EventQr code={event.code} shareOrigin={shareOrigin} size={112} />
        </div>
      </header>

      <main className="relative grid flex-1 gap-10 px-10 py-10 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex flex-col justify-center">
          {pinned ? (
            <div className="animate-enter">
              <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-gradient-light">
                Now answering{topicName && together.length > 0 ? ` · ${topicName}` : ""}
              </p>
              <p className="text-4xl font-medium leading-tight sm:text-5xl">{pinned.body}</p>
              <p className="mt-8 flex items-center gap-4 text-xl text-slate-400">
                <span>{pinned.author_name || "Anonymous"}</span>
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpIcon className="size-5" /> {pinned.upvotes}
                </span>
              </p>
              {together.length > 0 && (
                <div className="mt-10 rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-fuchsia-200">
                    Also asked by {together.length} other{together.length === 1 ? "" : "s"}
                  </p>
                  <ul className="space-y-2">
                    {together.slice(0, 4).map((q) => (
                      <li key={q.id} className="flex items-start gap-3 text-lg leading-snug text-white/85">
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fuchsia-300" />
                        <span className="line-clamp-2">{q.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center lg:text-left">
              {topics.some((t) => t.live.length > 0) ? (
                <>
                  <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gradient-light">
                    What the room is asking
                  </p>
                  <TopicMap topics={topics} theme="dark" />
                </>
              ) : (
                <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center">
                  <EventQr code={event.code} shareOrigin={shareOrigin} size={280} className="rounded-3xl p-5" />
                  <p className="text-5xl font-semibold leading-tight">
                    Got a question?
                    <br />
                    <span className="text-gradient-light">Scan to ask</span>
                    <br />
                    <span className="text-3xl text-slate-300">or join with code {event.code}</span>
                  </p>
                </div>
              )}
              {!event.is_open && (
                <p className="mt-6 text-xl text-slate-400">Questions are currently closed.</p>
              )}
            </div>
          )}
        </section>

        <aside>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
            Top questions
          </p>
          {upNext.length === 0 ? (
            <p className="text-lg text-slate-500">No questions yet.</p>
          ) : (
            <ol className="space-y-3">
              {upNext.map(({ question, count, votes, topic }) => (
                <li
                  key={question.id}
                  className={`animate-enter flex gap-4 rounded-xl bg-white/10 p-4 ring-1 backdrop-blur ${
                    count > 1 ? "ring-fuchsia-300/60" : "ring-white/15"
                  }`}
                >
                  <span className="flex w-10 shrink-0 flex-col items-center text-fuchsia-300">
                    <ArrowUpIcon className="size-4" />
                    <span className="font-semibold tabular-nums">{votes}</span>
                  </span>
                  <div className="min-w-0">
                    {count > 1 && topic && (
                      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fuchsia-200">
                        <span className={`size-2 rounded-full ${topic.color.dot}`} />
                        {topic.name} · asked {count}×
                      </p>
                    )}
                    <p className="line-clamp-3 text-lg leading-snug">{question.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  );
}
