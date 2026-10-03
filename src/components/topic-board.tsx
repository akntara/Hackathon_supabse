"use client";

import type { ReactNode } from "react";
import type { QuestionRow } from "@/lib/types";
import type { TopicCluster } from "@/lib/topic-groups";
import { cn, formatTimestamp } from "@/lib/utils";
import { CheckIcon, PinIcon } from "./icons";
import { VoteButton } from "./question-card";
import { Badge, Button, Card, EmptyState, Spinner } from "./ui";

export function TopicBoard({
  topics,
  pending,
  grouping,
  onGroupPending,
  renderActions,
}: {
  topics: TopicCluster[];
  pending: QuestionRow[];
  grouping: boolean;
  onGroupPending: () => void;
  renderActions: (question: QuestionRow) => ReactNode;
}) {
  return (
    <div className="space-y-4">
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
              <QuestionLine
                key={question.id}
                question={question}
                duplicates={null}
                actions={renderActions(question)}
              />
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
        topics.map((topic) => (
          <Card key={topic.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{topic.name}</h2>
                  {topic.kind === "manual" && <Badge>Custom</Badge>}
                  {topic.kind === "ai" && <Badge tone="indigo">AI topic</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {topic.questions.length} asked · {topic.duplicates} duplicate
                  {topic.duplicates === 1 ? "" : "s"} · {topic.votes} vote
                  {topic.votes === 1 ? "" : "s"}
                </p>
              </div>
              {grouping && pending.length > 0 && <Spinner className="size-4 text-fuchsia-600" />}
            </div>
            <ul className="divide-y divide-violet-50">
              {topic.questions.map((question, index) => (
                <li key={question.id}>
                  <QuestionLine
                    question={question}
                    duplicates={topic.duplicates}
                    original={index === 0}
                    actions={renderActions(question)}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function QuestionLine({
  question,
  duplicates,
  original,
  actions,
}: {
  question: QuestionRow;
  duplicates: number | null;
  original?: boolean;
  actions?: ReactNode;
}) {
  const answered = question.status === "answered";
  const hidden = question.status === "hidden";

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        (answered || hidden) && "bg-slate-50/80",
      )}
    >
      <VoteButton count={question.upvotes} disabled={answered || hidden} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {original && <Badge>Original</Badge>}
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
          {!answered && !hidden && <Badge tone="green">Live</Badge>}
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
            {duplicates !== null && (
              <>
                <span className="font-medium text-slate-700">
                  {duplicates} duplicate{duplicates === 1 ? "" : "s"}
                </span>
                {" · "}
              </>
            )}
            <span className="tabular-nums">{question.upvotes} votes</span>
            {" · "}
            <span className="capitalize">{question.status}</span>
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
