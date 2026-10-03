// Supabase Edge Function: group-question
//
// Embeds a question with OpenAI, then calls assign_question_group, which uses
// pgvector to attach it to the most similar AI topic (or start a new one) and
// records the similarity index.
//
// The database call runs with the caller's JWT, so assign_question_group's
// own check (author or event organizer) still applies.
//
// Request:  POST { "questionId": "<uuid>" }  with  Authorization: Bearer <user JWT>
// Response: { groupId, name, created, similarity }
//
// Secrets:  OPENAI_API_KEY (required)
//           OPENAI_EMBEDDING_MODEL, OPENAI_TOPIC_MODEL (optional)

import { createClient } from "npm:@supabase/supabase-js@2";

const EMBEDDING_DIMENSIONS = 1536;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AssignedGroup = {
  group_id: string;
  group_name: string;
  created: boolean;
  similarity: number | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function openAi(path: string, body: unknown) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY secret is not set on this Edge Function.");

  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { error?: { message?: string } }) => b.error?.message ?? "")
      .catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}). ${detail.slice(0, 180)}`.trim());
  }
  return res.json();
}

async function embedQuestion(text: string): Promise<number[]> {
  const model = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
  const data = await openAi("embeddings", {
    model,
    input: text,
    ...(model.startsWith("text-embedding-3") ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
  });
  const embedding: number[] | undefined = data?.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("OpenAI returned an unexpected embedding.");
  }
  return embedding;
}

type ExistingTopic = { name: string; examples: string[] };

function topicsWithExamples(
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

function cleanTopicLabel(raw: string) {
  const cleaned = (raw.split("\n")[0] ?? "")
    .replace(/^["'\s]+|["'\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return cleaned || "General";
}

function resolveTopic(raw: string, existing: ExistingTopic[]) {
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

async function topicLabel(text: string, existing: ExistingTopic[]): Promise<string> {
  const data = await openAi("chat/completions", {
    model: Deno.env.get("OPENAI_TOPIC_MODEL") || "gpt-4o-mini",
    temperature: 0,
    max_tokens: 40,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: topicPrompt(existing) },
      { role: "user", content: text },
    ],
  });
  return resolveTopic(data?.choices?.[0]?.message?.content ?? "", existing);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  // Verifies the JWT (works with both legacy and asymmetric signing keys).
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return json({ error: "Invalid session." }, 401);

  let questionId = "";
  try {
    const body = await req.json();
    questionId = String(body?.questionId ?? "");
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!UUID_RE.test(questionId)) return json({ error: "A question id is required." }, 400);

  const { data: question, error: readError } = await supabase
    .from("questions")
    .select("id, event_id, body, group_id, similarity")
    .eq("id", questionId)
    .maybeSingle();

  if (readError) return json({ error: readError.message }, 400);
  if (!question) return json({ error: "Question not found." }, 404);

  if (question.group_id) {
    const { data: group } = await supabase
      .from("question_groups")
      .select("name")
      .eq("id", question.group_id)
      .maybeSingle();
    return json({
      groupId: question.group_id,
      name: group?.name ?? "Topic",
      created: false,
      similarity: question.similarity ?? null,
    });
  }

  try {
    const [{ data: groups }, { data: grouped }] = await Promise.all([
      supabase
        .from("question_groups")
        .select("id, name")
        .eq("event_id", question.event_id)
        .eq("kind", "ai")
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("questions")
        .select("group_id, body")
        .eq("event_id", question.event_id)
        .not("group_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    const [embedding, topic] = await Promise.all([
      embedQuestion(question.body),
      topicLabel(question.body, topicsWithExamples(groups ?? [], grouped ?? [])),
    ]);

    const { data: assigned, error } = await supabase
      .rpc("assign_question_group", {
        p_question_id: question.id,
        p_embedding: `[${embedding.join(",")}]`,
        p_topic_name: topic,
      })
      .single<AssignedGroup>();

    if (error || !assigned) {
      return json({ error: error?.message ?? "Could not group this question." }, 500);
    }

    return json({
      groupId: assigned.group_id,
      name: assigned.group_name,
      created: assigned.created,
      similarity: assigned.similarity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not group this question.";
    console.error("group-question failed:", message);
    return json({ error: message }, 502);
  }
});
