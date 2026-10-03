import { NextResponse } from "next/server";
import { clusterQuestions } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { topicKey } from "@/lib/topic-groups";

const MAX_QUESTIONS = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventId =
    typeof payload === "object" && payload && "eventId" in payload
      ? String((payload as { eventId: unknown }).eventId)
      : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "An event id is required." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  const [{ data: groups, error: groupsError }, { data: questions, error: questionsError }] =
    await Promise.all([
      supabase
        .from("question_groups")
        .select("id, name, kind")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
      supabase
        .from("questions")
        .select("id, body, group_id, status")
        .eq("event_id", eventId)
        .neq("status", "hidden")
        .order("created_at", { ascending: true })
        .limit(MAX_QUESTIONS),
    ]);

  if (groupsError || questionsError) {
    return NextResponse.json(
      { error: (groupsError ?? questionsError)?.message ?? "Could not load questions." },
      { status: 400 },
    );
  }

  const manual = new Set((groups ?? []).filter((g) => g.kind === "manual").map((g) => g.id));
  const candidates = (questions ?? []).filter((q) => !q.group_id || !manual.has(q.group_id));
  if (candidates.length === 0) {
    return NextResponse.json({ topics: 0, moved: 0 });
  }

  try {
    const proposed = await clusterQuestions(
      candidates.map((q) => q.body),
      (groups ?? []).filter((g) => g.kind === "ai").map((g) => g.name),
    );

    const byKey = new Map<string, { name: string; question_ids: string[] }>();
    for (const cluster of proposed) {
      const key = topicKey(cluster.name) || cluster.name.toLowerCase();
      const entry = byKey.get(key) ?? { name: cluster.name, question_ids: [] };
      entry.question_ids.push(...cluster.indexes.map((i) => candidates[i].id));
      byKey.set(key, entry);
    }

    const { data, error } = await supabase
      .rpc("apply_topic_clusters", {
        p_event_id: eventId,
        p_clusters: [...byKey.values()],
      })
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not apply the new topics." },
        { status: error?.code === "42501" ? 403 : 500 },
      );
    }

    return NextResponse.json({ topics: data.topics, moved: data.moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not re-cluster topics.";
    console.error("recluster failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
