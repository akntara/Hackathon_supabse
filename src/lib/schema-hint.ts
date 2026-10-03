const MIGRATION = "supabase/migrations/20261003130000_ai_question_groups.sql";

/** Turn a missing-column or missing-function error into a setup instruction. */
export function explainSchemaError(message: string) {
  if (
    /similarity_threshold|assign_question_group|question_embeddings/.test(message) &&
    /schema cache|does not exist|Could not find/i.test(message)
  ) {
    return `Run ${MIGRATION} in the Supabase SQL editor, then refresh. That adds topic embeddings and the similarity threshold.`;
  }
  return message;
}
