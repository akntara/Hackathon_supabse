"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { QuestionRow } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import { ArrowUpIcon, CheckIcon, PinIcon } from "./icons";
import { Badge } from "./ui";

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const noopSubscribe = () => () => {};

export function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

export function VoteButton({
  count,
  voted,
  disabled,
  onClick,
}: {
  count: number;
  voted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const interactive = !!onClick && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={voted}
      aria-label={voted ? "Remove upvote" : "Upvote"}
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-sm font-semibold ring-1 ring-inset transition-all",
        voted
          ? "bg-linear-to-b from-violet-600 to-fuchsia-600 text-white ring-transparent shadow-md shadow-fuchsia-500/30"
          : "bg-violet-50 text-violet-700 ring-violet-100",
        interactive && !voted && "hover:-translate-y-0.5 hover:bg-violet-100 hover:ring-violet-300",
        interactive && voted && "hover:brightness-110",
        !interactive && "cursor-default",
      )}
    >
      <ArrowUpIcon className="size-4" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

export function QuestionCard({
  question,
  now,
  voted,
  onVote,
  isMine,
  actions,
}: {
  question: QuestionRow;
  now: number;
  voted?: boolean;
  onVote?: () => void;
  isMine?: boolean;
  actions?: ReactNode;
}) {
  const answered = question.status === "answered";
  const hidden = question.status === "hidden";

  return (
    <article
      className={cn(
        "animate-enter flex gap-4 rounded-2xl p-4 ring-1 backdrop-blur-xl transition hover:shadow-md",
        question.is_pinned
          ? "bg-white ring-2 ring-fuchsia-400 shadow-lg shadow-fuchsia-500/15"
          : "bg-white/80 ring-violet-100 shadow-sm shadow-violet-500/5",
        (answered || hidden) && "bg-white/50",
      )}
    >
      <VoteButton
        count={question.upvotes}
        voted={voted}
        onClick={onVote}
        disabled={answered || hidden}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {question.is_pinned && (
            <Badge tone="indigo">
              <PinIcon className="size-3" /> Now answering
            </Badge>
          )}
          {answered && (
            <Badge tone="green">
              <CheckIcon className="size-3" /> Answered
            </Badge>
          )}
          {hidden && <Badge tone="rose">Hidden</Badge>}
          {isMine && <Badge>You</Badge>}
        </div>
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-6",
            hidden ? "text-slate-500" : "text-slate-900",
          )}
        >
          {question.body}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-600">{question.author_name || "Anonymous"}</span>
            {" · "}
            <time dateTime={question.created_at} suppressHydrationWarning>
              {timeAgo(question.created_at, now)}
            </time>
          </p>
          {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
        </div>
      </div>
    </article>
  );
}
