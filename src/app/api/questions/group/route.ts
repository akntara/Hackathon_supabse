import { NextResponse } from "next/server";
import { embedQuestion, topicLabel, toVectorLiteral } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

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

  const questionId =
    typeof payload === "object" && payload && "questionId" in payload
      ? String((payload as { questionId: unknown }).questionId)
      : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(questionId)) {
    return NextResponse.json({ error: "A question id is required." }, { status: 400 });
  }

  const { data: question, error: readError } = await supabase
    .from("questions")
    .select("id, body, group_id")
    .eq("id", questionId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  if (question.group_id) {
    const { data: group } = await supabase
      .from("question_groups")
      .select("name")
      .eq("id", question.group_id)
      .maybeSingle();
    return NextResponse.json({
      groupId: question.group_id,
      name: group?.name ?? "Topic",
      created: false,
      similarity: null,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  try {
    const [embedding, topic] = await Promise.all([
      embedQuestion(question.body),
      topicLabel(question.body),
    ]);

    const { data: assigned, error } = await supabase
      .rpc("assign_question_group", {
        p_question_id: question.id,
        p_embedding: toVectorLiteral(embedding),
        p_topic_name: topic,
      })
      .single();

    if (error || !assigned) {
      return NextResponse.json(
        { error: error?.message ?? "Could not group this question." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      groupId: assigned.group_id,
      name: assigned.group_name,
      created: assigned.created,
      similarity: assigned.similarity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not group this question.";
    console.error("group question failed", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
