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

/** Short topic label for a new question cluster. */
export async function topicLabel(text: string): Promise<string> {
  const model = process.env.OPENAI_TOPIC_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 24,
      messages: [
        {
          role: "system",
          content:
            "You label live audience questions for a host. Reply with only a 2 to 5 word topic. No quotes, no punctuation at the end.",
        },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) throw await openAiError(res);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return cleanTopicLabel(json.choices?.[0]?.message?.content ?? "");
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
