import type { QuestionGroupRow, QuestionRow } from "./types";

export type TopicCluster = {
  id: string;
  name: string;
  kind: QuestionGroupRow["kind"];
  /** Oldest first, so the original ask stays above its duplicates. */
  questions: QuestionRow[];
  votes: number;
  duplicates: number;
};

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
    const votes = sorted.reduce((sum, question) => sum + question.upvotes, 0);
    return {
      id,
      name: group.name,
      kind: group.kind ?? "manual",
      questions: sorted,
      votes,
      duplicates: Math.max(0, sorted.length - 1),
    };
  });

  topics.sort((a, b) => {
    if (a.votes !== b.votes) return b.votes - a.votes;
    const aLatest = a.questions[a.questions.length - 1]?.created_at ?? "";
    const bLatest = b.questions[b.questions.length - 1]?.created_at ?? "";
    return bLatest.localeCompare(aLatest);
  });

  pending.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { topics, pending };
}
