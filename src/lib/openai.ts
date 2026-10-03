const EMBEDDING_DIMENSIONS = 1536;

function requireApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.");
  }
  return key;
}

async function openAiError(res: Response) {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    detail = "";
  }
  const suffix = detail ? ` ${detail.slice(0, 180)}` : "";
  return new Error(`OpenAI request failed (${res.status}).${suffix}`);
}

/** Embed a question with text-embedding-3-small (1536 dimensions). */
export async function embedQuestion(text: string): Promise<number[]> {
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw await openAiError(res);

  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("OpenAI returned an unexpected embedding.");
  }
  return embedding;
}

export type ExistingTopic = { name: string; examples: string[] };

/** Existing topics with up to two of their oldest questions as examples. */
export function topicsWithExamples(
  groups: Array<{ id: string; name: string }>,
  questions: Array<{ group_id: string | null; body: string }>,
): ExistingTopic[] {
  const examples = new Map<string, string[]>();
  for (const q of questions) {
    if (!q.group_id) continue;
    const list = examples.get(q.group_id) ?? [];
    if (list.length < 2) list.push(q.body.slice(0, 160));
    examples.set(q.group_id, list);
  }
  return groups.map((g) => ({ name: g.name, examples: examples.get(g.id) ?? [] }));
}

function topicPrompt(existing: ExistingTopic[]) {
  const base =
    "You group live audience questions into topics for a host. Questions that ask for the same thing in different words belong to the same topic.";
  if (existing.length === 0) {
    return `${base} Reply with JSON: {"new": "<2 to 5 word topic>"}.`;
  }
  const list = existing
    .map((t, i) => {
      const ex = t.examples.map((e) => `"${e}"`).join("; ");
      return `${i + 1}. ${t.name}${ex ? ` (e.g. ${ex})` : ""}`;
    })
    .join("\n");
  return `${base}\nExisting topics:\n${list}\nIf the new question is about the same subject as an existing topic, even with different wording or synonyms, reply with JSON: {"match": <topic number>}. Only if none fit, reply with JSON: {"new": "<2 to 5 word topic>"}.`;
}

export function resolveTopic(raw: string, existing: ExistingTopic[]) {
  try {
    const parsed = JSON.parse(raw) as { match?: unknown; new?: unknown };
    const index = Number(parsed.match);
    if (Number.isInteger(index) && index >= 1 && index <= existing.length) {
      return existing[index - 1].name;
    }
    if (typeof parsed.new === "string") return cleanTopicLabel(parsed.new);
  } catch {
    // Fall through to treating the reply as a plain label.
  }
  return cleanTopicLabel(raw);
}

/** Picks an existing topic for the question, or a short label for a new one. */
export async function topicLabel(text: string, existing: ExistingTopic[] = []): Promise<string> {
  const model = process.env.OPENAI_TOPIC_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 40,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: topicPrompt(existing) },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw await openAiError(res);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return resolveTopic(json.choices?.[0]?.message?.content ?? "", existing);
}

export type ProposedCluster = { name: string; indexes: number[] };

/**
 * Clusters a whole event's questions in one call. Returns each topic with the
 * zero-based indexes of its questions; every question appears at most once.
 */
export async function clusterQuestions(
  questions: string[],
  currentTopics: string[] = [],
): Promise<ProposedCluster[]> {
  if (questions.length === 0) return [];
  const model = process.env.OPENAI_TOPIC_MODEL || "gpt-4o-mini";
  const known = currentTopics.length
    ? `\nTopic names already shown to the audience (reuse one when it fits, so names stay stable):\n${currentTopics.map((t) => `- ${t}`).join("\n")}`
    : "";
  const list = questions.map((q, i) => `${i + 1}. ${q.slice(0, 200)}`).join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Math.min(4000, 200 + questions.length * 12),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You cluster live audience questions so a host can answer each topic once. " +
            "Put questions in the same topic when answering one would mostly answer the others, even if they use different words. " +
            "Keep genuinely different subjects apart and prefer specific topics over broad catch-alls. Avoid one-question topics when a question clearly fits another topic. " +
            "Name each topic in 2 to 5 words. Every question number must appear in exactly one topic. " +
            'Reply with JSON: {"topics": [{"name": "<topic>", "questions": [<question numbers>]}]}.' +
            known,
        },
        { role: "user", content: list },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw await openAiError(res);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let parsed: { topics?: Array<{ name?: unknown; questions?: unknown }> };
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "");
  } catch {
    throw new Error("OpenAI returned clusters that could not be read.");
  }

  const seen = new Set<number>();
  const clusters: ProposedCluster[] = [];
  for (const topic of parsed.topics ?? []) {
    const name = cleanTopicLabel(typeof topic.name === "string" ? topic.name : "");
    const indexes: number[] = [];
    for (const n of Array.isArray(topic.questions) ? topic.questions : []) {
      const i = Number(n) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= questions.length || seen.has(i)) continue;
      seen.add(i);
      indexes.push(i);
    }
    if (indexes.length > 0) clusters.push({ name, indexes });
  }
  return clusters;
}

export function cleanTopicLabel(raw: string) {
  const line = raw.split("\n")[0] ?? "";
  const cleaned = line
    .replace(/^["'\s]+|["'\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return cleaned.length > 0 ? cleaned : "General";
}

export function toVectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}
