import type { QuestionRow } from "./types";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export type SortMode = "top" | "recent";

export function sortQuestions(questions: QuestionRow[], mode: SortMode) {
  return [...questions].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (mode === "top" && a.upvotes !== b.upvotes) return b.upvotes - a.upvotes;
    return b.created_at.localeCompare(a.created_at);
  });
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const stamp = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTimestamp(iso: string) {
  return stamp.format(new Date(iso));
}

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

export function normalizeCode(input: string) {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/e\/([a-z0-9]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/[^a-z0-9]/gi, "").toLowerCase();
}
