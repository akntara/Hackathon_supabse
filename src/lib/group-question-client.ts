import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type GroupQuestionResult =
  | { ok: true; groupId: string; name: string; created: boolean; similarity: number | null }
  | { ok: false; error: string };

type Payload = {
  error?: string;
  groupId?: string;
  name?: string;
  created?: boolean;
  similarity?: number | null;
};

const EDGE_FUNCTION = "group-question";

/** "edge" (default) uses the Supabase Edge Function; "api" uses the Next.js route. */
const BACKEND = process.env.NEXT_PUBLIC_CLUSTERING_BACKEND === "api" ? "api" : "edge";

function toResult(payload: Payload): GroupQuestionResult {
  if (!payload.groupId) {
    return { ok: false, error: payload.error || "Could not group this question." };
  }
  return {
    ok: true,
    groupId: payload.groupId,
    name: payload.name || "Topic",
    created: !!payload.created,
    similarity: typeof payload.similarity === "number" ? payload.similarity : null,
  };
}

/** Returns null when the function is not reachable (e.g. not deployed yet). */
async function viaEdgeFunction(questionId: string): Promise<GroupQuestionResult | null> {
  const { data, error } = await createClient().functions.invoke<Payload>(EDGE_FUNCTION, {
    body: { questionId },
  });

  if (!error) return toResult(data ?? {});

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return null;
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404) return null;
    const body = (await response.json().catch(() => ({}))) as Payload;
    return { ok: false, error: body.error || `Grouping failed (${response.status}).` };
  }
  return { ok: false, error: error.message };
}

async function viaApiRoute(questionId: string): Promise<GroupQuestionResult> {
  const res = await fetch("/api/questions/group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId }),
    keepalive: true,
  });
  const payload = (await res.json().catch(() => ({}))) as Payload;
  if (!res.ok) return { ok: false, error: payload.error || "Could not group this question." };
  return toResult(payload);
}

export async function requestQuestionGroup(questionId: string): Promise<GroupQuestionResult> {
  try {
    if (BACKEND === "edge") {
      const result = await viaEdgeFunction(questionId);
      if (result) return result;
    }
    return await viaApiRoute(questionId);
  } catch {
    return { ok: false, error: "Could not reach the grouping service." };
  }
}
