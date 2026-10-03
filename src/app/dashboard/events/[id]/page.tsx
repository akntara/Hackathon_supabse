import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrganizerConsole } from "@/components/organizer-console";
import { getShareOrigin } from "@/lib/share-origin";
import { getOrganizer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderate event" };

export default async function EventConsolePage({ params }: PageProps<"/dashboard/events/[id]">) {
  const { id } = await params;
  const { supabase, user } = await getOrganizer();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .eq("organizer_id", user!.id)
    .maybeSingle();

  if (!event) notFound();

  const [{ data: questions }, { data: groups }, shareOrigin] = await Promise.all([
    supabase
      .from("questions")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("question_groups")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true }),
    getShareOrigin(),
  ]);

  return (
    <OrganizerConsole
      event={event}
      initialQuestions={questions ?? []}
      initialGroups={groups ?? []}
      shareOrigin={shareOrigin}
    />
  );
}
