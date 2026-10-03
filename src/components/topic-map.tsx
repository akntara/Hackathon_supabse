"use client";

import { useMemo, useState } from "react";
import { formatSimilarity, topicImportance, type TopicCluster } from "@/lib/topic-groups";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, CheckIcon, PinIcon } from "./icons";
import { Button, Card, EmptyState } from "./ui";

type Bubble = {
  topic: TopicCluster;
  score: number;
  r: number;
  x: number;
  y: number;
};

const MIN_R = 28;
const MAX_R = 120;
const GAP = 8;

/** Room reserved around the top bubble for its pulse rings and label. */
const TOP_HALO = 34;

/** Server and browser Math can differ in the last digits; round so hydration matches. */
const round = (n: number) => Math.round(n * 100) / 100;

/** Greedy circle packing: biggest first, each placed at the first free spot on a spiral. */
function pack(items: Array<{ topic: TopicCluster; score: number; r: number }>): Bubble[] {
  const placed: Bubble[] = [];
  const reach = (b: Bubble, index: number) => b.r + (index === 0 ? TOP_HALO : 0);
  for (const item of items) {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }
    for (let i = 1; i < 6000; i++) {
      const angle = i * 0.42;
      const dist = i * 0.9;
      const x = round(Math.cos(angle) * dist);
      const y = round(Math.sin(angle) * dist * 0.72);
      const free = placed.every((p, index) => Math.hypot(p.x - x, p.y - y) >= reach(p, index) + item.r + GAP);
      if (free) {
        placed.push({ ...item, x, y });
        break;
      }
    }
  }
  return placed;
}

export function TopicMap({
  topics,
  pendingCount = 0,
  theme = "light",
  busyTopic,
  onTakeUp,
  onAnswerAll,
}: {
  topics: TopicCluster[];
  pendingCount?: number;
  theme?: "light" | "dark";
  busyTopic?: string | null;
  onTakeUp?: (topic: TopicCluster) => void;
  onAnswerAll?: (topic: TopicCluster) => void;
}) {
  const dark = theme === "dark";
  const interactive = !!onTakeUp;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { bubbles, viewBox, topId } = useMemo(() => {
    const open = topics
      .filter((t) => t.live.length > 0)
      .map((topic) => ({ topic, score: topicImportance(topic) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    const max = Math.max(1, ...open.map((o) => o.score));
    const sized = open.map((o) => ({ ...o, r: round(MIN_R + (MAX_R - MIN_R) * Math.pow(o.score / max, 0.8)) }));
    const packed = pack(sized);

    if (packed.length === 0) return { bubbles: [], viewBox: "0 0 100 100", topId: null };
    const pad = 28;
    const minX = Math.min(...packed.map((b) => b.x - b.r)) - pad;
    const maxX = Math.max(...packed.map((b) => b.x + b.r)) + pad;
    const minY = Math.min(...packed.map((b, i) => b.y - b.r - (i === 0 ? TOP_HALO : 0))) - pad;
    const maxY = Math.max(...packed.map((b) => b.y + b.r)) + pad;
    return {
      bubbles: packed,
      viewBox: [minX, minY, maxX - minX, maxY - minY].map(round).join(" "),
      topId: packed[0].topic.id,
    };
  }, [topics]);

  const selected =
    bubbles.find((b) => b.topic.id === selectedId)?.topic ?? (interactive ? bubbles[0]?.topic : undefined);

  if (bubbles.length === 0) {
    return dark ? (
      <p className="text-lg text-slate-400">Topics will appear here as questions come in.</p>
    ) : (
      <EmptyState
        title="No open topics yet"
        description={
          pendingCount > 0
            ? `${pendingCount} question${pendingCount === 1 ? " is" : "s are"} waiting to be grouped.`
            : "Share the event code. Topics will bubble up here as questions arrive."
        }
      />
    );
  }

  const map = (
    <div className={cn("relative", !dark && "rounded-2xl bg-white/60 ring-1 ring-violet-100 backdrop-blur")}>
      <svg viewBox={viewBox} className="block h-auto w-full" role="img" aria-label="Topic importance map">
        <defs>
          {bubbles.map(({ topic }) => (
            <radialGradient key={topic.id} id={`grad-${topic.id}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={dark ? 0.35 : 0.55} />
              <stop offset="55%" stopColor={topic.color.hex} stopOpacity={dark ? 0.75 : 0.85} />
              <stop offset="100%" stopColor={topic.color.hex} stopOpacity={1} />
            </radialGradient>
          ))}
        </defs>

        {bubbles.map(({ topic, score, r, x, y }) => {
          const isTop = topic.id === topId;
          const isSelected = interactive && selected?.id === topic.id;
          const answering = topic.live.some((q) => q.is_pinned);
          const votes = topic.live.reduce((s, q) => s + q.upvotes, 0);
          const showDetail = r >= 52;

          return (
            <g
              key={topic.id}
              style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 700ms cubic-bezier(.2,.8,.2,1)" }}
            >
              <g
                className={cn("animate-bubble-in", interactive && "cursor-pointer")}
                onClick={interactive ? () => setSelectedId(topic.id) : undefined}
              >
                <title>{`${topic.name}: ${topic.live.length} open, ${votes} votes, importance ${score}`}</title>

                {isTop && (
                  <>
                    <circle r={r + 6} fill="none" stroke={topic.color.hex} strokeWidth={4} className="animate-pop-ring" />
                    <circle r={r + 6} fill="none" stroke={topic.color.hex} strokeWidth={3} className="animate-pop-ring [animation-delay:1s]" />
                  </>
                )}

                <circle
                  r={r}
                  fill={`url(#grad-${topic.id})`}
                  stroke={answering ? "#ffffff" : isSelected ? (dark ? "#ffffff" : "#1e1b4b") : "transparent"}
                  strokeWidth={answering || isSelected ? 4 : 0}
                  style={{
                    transition: "r 700ms cubic-bezier(.2,.8,.2,1)",
                    filter: isTop ? `drop-shadow(0 10px 24px ${topic.color.hex}aa)` : `drop-shadow(0 4px 10px ${topic.color.hex}55)`,
                  }}
                  className={isTop ? "animate-pop-pulse" : undefined}
                />

                <foreignObject x={-r} y={-r} width={r * 2} height={r * 2} style={{ pointerEvents: "none" }}>
                  <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center text-white">
                    <span
                      className="line-clamp-3 font-semibold leading-tight drop-shadow"
                      style={{ fontSize: round(Math.max(11, Math.min(26, r / 4.2))) }}
                    >
                      {topic.name}
                    </span>
                    {showDetail && (
                      <span className="mt-1 font-medium text-white/90" style={{ fontSize: round(Math.max(10, r / 7.5)) }}>
                        {topic.live.length > 1 ? `Asked ${topic.live.length}× · ` : ""}
                        {votes} vote{votes === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </foreignObject>

              </g>
            </g>
          );
        })}

        {bubbles.map(({ topic, r, x, y }) => {
          const answering = topic.live.some((q) => q.is_pinned);
          if (topic.id !== topId && !answering) return null;
          return (
            <foreignObject
              key={`label-${topic.id}`}
              x={x - 90}
              y={y - r - 32}
              width={180}
              height={28}
              style={{ pointerEvents: "none", transition: "all 700ms cubic-bezier(.2,.8,.2,1)" }}
            >
              <div className="flex justify-center">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-md",
                    answering ? "bg-white text-fuchsia-700 ring-1 ring-fuchsia-200" : "bg-slate-900 text-white",
                  )}
                >
                  {answering ? "Now answering" : "Most important"}
                </span>
              </div>
            </foreignObject>
          );
        })}
      </svg>

      <p className={cn("px-4 pb-3 text-xs", dark ? "text-slate-400" : "text-slate-500")}>
        Bubble size = open votes + repeat asks. The pulsing bubble is the most important topic right now.
        {pendingCount > 0 && ` ${pendingCount} question${pendingCount === 1 ? "" : "s"} still being grouped.`}
      </p>
    </div>
  );

  if (!interactive || !selected) return map;

  const busy = busyTopic === selected.id;
  const answering = selected.live.some((q) => q.is_pinned);
  const rank = bubbles.findIndex((b) => b.topic.id === selected.id) + 1;
  const sortedLive = [...selected.live].sort((a, b) => b.upvotes - a.upvotes);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      {map}
      <Card className="flex flex-col overflow-hidden lg:max-h-[560px]">
        <div className="border-b border-violet-100 p-4">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: selected.color.hex }} />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              #{rank} by importance
            </p>
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{selected.name}</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {selected.live.length} open · {selected.live.reduce((s, q) => s + q.upvotes, 0)} votes
            {formatSimilarity(selected.avgSimilarity) && ` · similarity index ${formatSimilarity(selected.avgSimilarity)}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={answering ? "secondary" : "primary"} onClick={() => onTakeUp?.(selected)} disabled={busy}>
              <PinIcon className="size-4" />
              {answering ? "Stop answering" : "Take up topic"}
            </Button>
            {selected.live.length > 1 && onAnswerAll && (
              <Button size="sm" variant="secondary" onClick={() => onAnswerAll(selected)} loading={busy}>
                <CheckIcon className="size-4" />
                Answer all {selected.live.length}
              </Button>
            )}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-violet-50 overflow-y-auto">
          {sortedLive.map((q) => (
            <li key={q.id} className="flex gap-3 px-4 py-3">
              <span className="flex w-9 shrink-0 flex-col items-center rounded-lg bg-violet-50 py-1 text-xs font-semibold text-violet-700">
                <ArrowUpIcon className="size-3.5" />
                {q.upvotes}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-5 text-slate-800">{q.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {q.author_name || "Anonymous"}
                  {formatSimilarity(q.similarity) && ` · ${formatSimilarity(q.similarity)} match`}
                  {q.is_pinned && " · now answering"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
