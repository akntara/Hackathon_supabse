import type { QuestionGroupRow, QuestionRow } from "./types";

export type TopicCluster = {
  id: string;
  name: string;
  kind: QuestionGroupRow["kind"];
  /** Oldest first, so the original ask stays above its duplicates. */
  questions: QuestionRow[];
  votes: number;
  duplicates: number;
  /** Live (unanswered, visible) questions in this topic. */
  live: QuestionRow[];
  /** Mean similarity of matched questions, null when nothing has matched yet. */
  avgSimilarity: number | null;
  /** The live question the speaker should read out: most votes, then oldest. */
  representative: QuestionRow | null;
  /** Stable highlight colour for this topic. */
  color: ClusterColor;
};

export type ClusterColor = {
  hex: string;
  dot: string;
  ring: string;
  bar: string;
  chip: string;
};

// Full class names so Tailwind can see them.
const PALETTE: ClusterColor[] = [
  { hex: "#d946ef", dot: "bg-fuchsia-500", ring: "ring-fuchsia-300", bar: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200" },
  { hex: "#f59e0b", dot: "bg-amber-500", ring: "ring-amber-300", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  { hex: "#0ea5e9", dot: "bg-sky-500", ring: "ring-sky-300", bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  { hex: "#10b981", dot: "bg-emerald-500", ring: "ring-emerald-300", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { hex: "#f43f5e", dot: "bg-rose-500", ring: "ring-rose-300", bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700 ring-rose-200" },
  { hex: "#8b5cf6", dot: "bg-violet-500", ring: "ring-violet-300", bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700 ring-violet-200" },
  { hex: "#14b8a6", dot: "bg-teal-500", ring: "ring-teal-300", bar: "bg-teal-500", chip: "bg-teal-50 text-teal-700 ring-teal-200" },
  { hex: "#f97316", dot: "bg-orange-500", ring: "ring-orange-300", bar: "bg-orange-500", chip: "bg-orange-50 text-orange-700 ring-orange-200" },
];

function colorFor(id: string): ClusterColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function pickRepresentative(live: QuestionRow[]) {
  return (
    [...live].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.upvotes !== b.upvotes) return b.upvotes - a.upvotes;
      return a.created_at.localeCompare(b.created_at);
    })[0] ?? null
  );
}

// Keep in sync with public.topic_key in supabase/migrations.
const FILLER_WORDS = new Set([
  "a", "an", "the", "and", "or", "with", "in", "into", "for", "of", "on", "to",
  "about", "at", "from", "by", "my", "your", "our",
]);

export function topicKey(name: string) {
  const words = name
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const meaningful = words.filter((word) => !FILLER_WORDS.has(word));
  return (meaningful.length ? meaningful : words).join(" ");
}

/**
 * Collapses groups whose names differ only by case, punctuation or filler words
 * ("Getting started with AI" / "Getting started in AI") into the oldest one, so
 * a topic that was created twice shows up once everywhere.
 */
export function mergeDuplicateTopics(questions: QuestionRow[], groups: QuestionGroupRow[]) {
  const canonical = new Map<string, QuestionGroupRow>();
  const alias = new Map<string, string>();
  const ordered = [...groups].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const group of ordered) {
    const key = topicKey(group.name);
    const first = key ? canonical.get(key) : undefined;
    if (first) alias.set(group.id, first.id);
    else if (key) canonical.set(key, group);
  }
  if (alias.size === 0) return { questions, groups };

  return {
    groups: groups.filter((group) => !alias.has(group.id)),
    questions: questions.map((q) =>
      q.group_id && alias.has(q.group_id) ? { ...q, group_id: alias.get(q.group_id)! } : q,
    ),
  };
}

export function buildTopicGroups(questions: QuestionRow[], groups: QuestionGroupRow[]) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const buckets = new Map<string, QuestionRow[]>();
  const pending: QuestionRow[] = [];

  for (const question of questions) {
    if (question.group_id && byId.has(question.group_id)) {
      const list = buckets.get(question.group_id) ?? [];
      list.push(question);
      buckets.set(question.group_id, list);
    } else {
      pending.push(question);
    }
  }

  const topics: TopicCluster[] = [...buckets.entries()].map(([id, rows]) => {
    const group = byId.get(id)!;
    const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const live = sorted.filter((q) => q.status === "live");
    const votes = sorted.reduce((sum, question) => sum + question.upvotes, 0);
    const scores = sorted
      .map((q) => q.similarity)
      .filter((s): s is number => typeof s === "number");
    return {
      id,
      name: group.name,
      kind: group.kind ?? "manual",
      questions: sorted,
      votes,
      duplicates: Math.max(0, sorted.length - 1),
      live,
      avgSimilarity: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      representative: pickRepresentative(live),
      color: colorFor(id),
    };
  });

  // Topics asked several times and still open come first: answer those together.
  topics.sort((a, b) => {
    const aHot = a.live.length >= 2 ? 1 : 0;
    const bHot = b.live.length >= 2 ? 1 : 0;
    if (aHot !== bHot) return bHot - aHot;
    const aLiveVotes = a.live.reduce((s, q) => s + q.upvotes, 0);
    const bLiveVotes = b.live.reduce((s, q) => s + q.upvotes, 0);
    if (aLiveVotes !== bLiveVotes) return bLiveVotes - aLiveVotes;
    if (a.live.length !== b.live.length) return b.live.length - a.live.length;
    const aLatest = a.questions[a.questions.length - 1]?.created_at ?? "";
    const bLatest = b.questions[b.questions.length - 1]?.created_at ?? "";
    return bLatest.localeCompare(aLatest);
  });

  pending.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { topics, pending };
}

export type ClusterInfo = {
  topicId: string;
  name: string;
  color: ClusterColor;
  /** Live questions in the topic, including this one. */
  liveCount: number;
};

/** Question id → its topic, for highlighting similar questions in flat lists. */
export function buildClusterIndex(questions: QuestionRow[], groups: QuestionGroupRow[]) {
  const { topics } = buildTopicGroups(questions, groups);
  const index = new Map<string, ClusterInfo>();
  for (const topic of topics) {
    const info: ClusterInfo = {
      topicId: topic.id,
      name: topic.name,
      color: topic.color,
      liveCount: topic.live.length,
    };
    for (const q of topic.questions) index.set(q.id, info);
  }
  return index;
}

/** Other live questions in the same topic as `question`. */
export function similarLiveQuestions(question: QuestionRow | undefined, questions: QuestionRow[]) {
  if (!question?.group_id) return [];
  return questions
    .filter((q) => q.id !== question.id && q.group_id === question.group_id && q.status === "live")
    .sort((a, b) => b.upvotes - a.upvotes);
}

/** Importance used to size and rank topics: open votes plus weight for repeat asks. */
export function topicImportance(topic: TopicCluster) {
  const votes = topic.live.reduce((sum, q) => sum + q.upvotes, 0);
  return votes + 2 * topic.live.length;
}

export function formatSimilarity(value: number | null | undefined) {
  if (typeof value !== "number") return null;
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
