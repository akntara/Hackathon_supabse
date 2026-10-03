export const DEFAULT_SIMILARITY_THRESHOLD = 0.82;

/** Default for new events. Existing events store their own value. */
export function defaultSimilarityThreshold() {
  const n = Number(process.env.QUESTION_SIMILARITY_THRESHOLD);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return DEFAULT_SIMILARITY_THRESHOLD;
  return Math.round(n * 100) / 100;
}
