"use client";

import type { ReactNode } from "react";
import type { QuestionRow } from "@/lib/types";
import { formatSimilarity, type TopicCluster } from "@/lib/topic-groups";
import { cn, formatTimestamp } from "@/lib/utils";
import { CheckIcon, PinIcon } from "./icons";
import { VoteButton } from "./question-card";
import { Badge, Button, Card, EmptyState, Spinner } from "./ui";

export function TopicBoard({
  topics,
  pending,
  grouping,
  busyTopic,
  onGroupPending,
  onTakeUp,
  onAnswerAll,
  renderActions,
}: {
  topics: TopicCluster[];
  pending: QuestionRow[];
  grouping: boolean;
  busyTopic: string | null;
  onGroupPending: () => void;
  onTakeUp: (topic: TopicCluster) => void;
  onAnswerAll: (topic: TopicCluster) => void;
  renderActions: (question: QuestionRow) => ReactNode;
}) {
  const hotCount = topics.filter((t) => t.live.length >= 2).length;

  return (
    <div className="space-y-4">
      {hotCount > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <span className="font-semibold">{hotCount}</span> topic{hotCount === 1 ? " was" : "s were"} asked
          more than once. They&apos;re highlighted at the top so you can answer each group in one go.
        </p>
      )}

      {pending.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Not grouped yet</p>
              <p className="text-sm text-slate-500">
                {grouping
                  ? "Comparing these questions with existing topics."
                  : "New questions are grouped automatically. Older ones wait until you group them."}
              </p>
            </div>
            {pending.some((question) => !question.group_id) && (
              <Button size="sm" variant="secondary" onClick={onGroupPending} loading={grouping}>
                {grouping
                  ? "Grouping"
                  : `Group ${pending.filter((question) => !question.group_id).length}`}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {pending.map((question) => (
              <QuestionLine key={question.id} question={question} actions={renderActions(question)} />
            ))}
          </div>
        </Card>
      )}

      {topics.length === 0 && pending.length === 0 ? (
        <EmptyState
          title="No questions yet"
          description="Share the event code. New questions will be grouped by topic as they arrive."
        />
      ) : (
        topics.map((topic) => {
          const hot = topic.live.length >= 2;
          const answering = topic.live.some((q) => q.is_pinned);
          const busy = busyTopic === topic.id;
          const index = formatSimilarity(topic.avgSimilarity);

          return (
            <Card
              key={topic.id}
              className={cn(
                "overflow-hidden",
                hot && `ring-2 ${topic.color.ring}`,
                answering && "ring-2 ring-fuchsia-500 shadow-xl shadow-fuchsia-500/15",
              )}
            >
              {answering && (
                <div className="bg-brand flex items-center gap-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                  <PinIcon className="size-3.5" /> Now answering this topic
                </div>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("size-2.5 shrink-0 rounded-full", topic.color.dot)} />
                    <h2 className="text-base font-semibold text-slate-900">{topic.name}</h2>
                    {hot && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          topic.color.chip,
                        )}
                      >
                        Asked {topic.live.length} times · answer together
                      </span>
                    )}
                    {topic.kind === "manual" && <Badge>Custom</Badge>}
                    {topic.kind === "ai" && !hot && <Badge tone="indigo">AI topic</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {topic.questions.length} asked · {topic.live.length} open · {topic.votes} vote
                    {topic.votes === 1 ? "" : "s"}
                    {index && (
                      <>
                        {" · "}
                        <span className="font-medium text-slate-700">Similarity index {index}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {grouping && pending.length > 0 && <Spinner className="size-4 text-fuchsia-600" />}
                  {topic.live.length > 0 && (
                    <Button
                      size="sm"
                      variant={answering ? "secondary" : "primary"}
                      onClick={() => onTakeUp(topic)}
                      disabled={busy}
                    >
                      <PinIcon className="size-4" />
                      {answering ? "Stop answering" : "Take up topic"}
                    </Button>
                  )}
                  {topic.live.length > 1 && (
                    <Button size="sm" variant="secondary" onClick={() => onAnswerAll(topic)} loading={busy}>
                      <CheckIcon className="size-4" />
                      Answer all {topic.live.length}
                    </Button>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-violet-50">
                {topic.questions.map((question, index) => (
                  <li key={question.id}>
                    <QuestionLine
                      question={question}
                      original={index === 0}
                      barClass={hot ? topic.color.bar : undefined}
                      matchedBody={
                        question.similar_to_id
                          ? topic.questions.find((q) => q.id === question.similar_to_id)?.body
                          : undefined
                      }
                      actions={renderActions(question)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

function QuestionLine({
  question,
  original,
  barClass,
  matchedBody,
  actions,
}: {
  question: QuestionRow;
  original?: boolean;
  barClass?: string;
  matchedBody?: string;
  actions?: ReactNode;
}) {
  const answered = question.status === "answered";
  const hidden = question.status === "hidden";
  const match = formatSimilarity(question.similarity);

  return (
    <div className={cn("relative flex gap-3 px-4 py-3", (answered || hidden) && "bg-slate-50/80")}>
      {barClass && <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r", barClass)} />}
      <VoteButton count={question.upvotes} disabled={answered || hidden} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {original && <Badge>Original</Badge>}
          {!original && match && (
            <span
              title={matchedBody ? `Matched: ${matchedBody}` : undefined}
              className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-violet-700 ring-1 ring-inset ring-violet-200"
            >
              {match} match
            </span>
          )}
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
        </div>
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-[15px] leading-6",
            hidden ? "text-slate-500" : "text-slate-900",
          )}
        >
          {question.body}
        </p>
        {matchedBody && (
          <p className="mt-1 line-clamp-1 text-xs text-slate-400">Similar to: “{matchedBody}”</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            <span className="tabular-nums">{question.upvotes} votes</span>
            {" · "}
            <time dateTime={question.created_at}>{formatTimestamp(question.created_at)}</time>
            {question.author_name ? ` · ${question.author_name}` : ""}
          </p>
          {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
