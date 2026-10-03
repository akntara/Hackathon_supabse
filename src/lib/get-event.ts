import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Public event details by code; does not join the event. */
export const getEventByCode = cache(async (code: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_event_by_code", { p_code: code }).maybeSingle();
  return data;
});
