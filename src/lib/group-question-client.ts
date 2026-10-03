export type GroupQuestionResult =
  | { ok: true; groupId: string; name: string; created: boolean }
  | { ok: false; error: string };

export async function requestQuestionGroup(questionId: string): Promise<GroupQuestionResult> {
  try {
    const res = await fetch("/api/questions/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
      keepalive: true,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      groupId?: string;
      name?: string;
      created?: boolean;
    };
    if (!res.ok || !payload.groupId) {
      return { ok: false, error: payload.error || "Could not group this question." };
    }
    return {
      ok: true,
      groupId: payload.groupId,
      name: payload.name || "Topic",
      created: !!payload.created,
    };
  } catch {
    return { ok: false, error: "Could not reach the grouping service." };
  }
}
