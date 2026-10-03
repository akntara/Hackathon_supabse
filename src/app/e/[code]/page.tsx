import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttendeeRoom } from "@/components/attendee-room";
import { getEventByCode } from "@/lib/get-event";

export async function generateMetadata({ params }: PageProps<"/e/[code]">): Promise<Metadata> {
  const { code } = await params;
  const event = await getEventByCode(code);
  return { title: event ? event.title : "Event not found" };
}

export default async function EventPage({ params }: PageProps<"/e/[code]">) {
  const { code } = await params;
  const event = await getEventByCode(code);
  if (!event) notFound();
  return <AttendeeRoom event={event} />;
}
