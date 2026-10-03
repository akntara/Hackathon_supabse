"use client";

import { useMemo } from "react";
import type { PublicEvent } from "@/lib/types";
import { useJoinEvent } from "@/lib/use-join-event";
import { useLiveEvent } from "@/lib/use-live-event";
import { sortQuestions } from "@/lib/utils";
import { ArrowUpIcon } from "./icons";
import { useOrigin } from "./question-card";
import { LiveIndicator } from "./ui";

export function PresentView({ event: initialEvent }: { event: PublicEvent }) {
  const { userId } = useJoinEvent(initialEvent.code);
  const { event, questions, connection } = useLiveEvent({
    event: initialEvent,
    enabled: !!userId,
  });
  const origin = useOrigin();

  const live = useMemo(
    () => sortQuestions(questions.filter((q) => q.status === "live"), "top"),
    [questions],
  );
  const pinned = live.find((q) => q.is_pinned);
  const upNext = live.filter((q) => !q.is_pinned).slice(0, 5);

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
        <div className="text-right">
          <p className="text-sm text-slate-400">
            Ask at <span className="font-medium text-white">{origin.replace(/^https?:\/\//, "")}</span>
          </p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-gradient-light">{event.code}</p>
        </div>
      </header>

      <main className="relative grid flex-1 gap-10 px-10 py-10 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex flex-col justify-center">
          {pinned ? (
            <div className="animate-enter">
              <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-gradient-light">
                Now answering
              </p>
              <p className="text-4xl font-medium leading-tight sm:text-5xl">{pinned.body}</p>
              <p className="mt-8 flex items-center gap-4 text-xl text-slate-400">
                <span>{pinned.author_name || "Anonymous"}</span>
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpIcon className="size-5" /> {pinned.upvotes}
                </span>
              </p>
            </div>
          ) : (
            <div className="text-center lg:text-left">
              <p className="text-5xl font-semibold leading-tight">
                Got a question?
                <br />
                <span className="text-gradient-light">Join with code {event.code}</span>
              </p>
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
              {upNext.map((q) => (
                <li key={q.id} className="animate-enter flex gap-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                  <span className="flex w-10 shrink-0 flex-col items-center text-fuchsia-300">
                    <ArrowUpIcon className="size-4" />
                    <span className="font-semibold tabular-nums">{q.upvotes}</span>
                  </span>
                  <p className="line-clamp-3 text-lg leading-snug">{q.body}</p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  );
}
