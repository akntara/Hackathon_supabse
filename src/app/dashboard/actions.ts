"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getOrganizer } from "@/lib/supabase/server";

export type CreateEventState = { error?: string } | undefined;

export async function createEvent(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  const { supabase, user } = await getOrganizer();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title) return { error: "Give your event a title." };
  if (title.length > 120) return { error: "Title must be 120 characters or fewer." };
  if (description.length > 1000) return { error: "Description must be 1000 characters or fewer." };

  const { data, error } = await supabase
    .from("events")
    .insert({ title, description: description || null, organizer_id: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create event." };

  revalidatePath("/dashboard");
  redirect(`/dashboard/events/${data.id}`);
}

export async function deleteEvent(formData: FormData) {
  const { supabase, user } = await getOrganizer();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  await supabase.from("events").delete().eq("id", id).eq("organizer_id", user.id);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
