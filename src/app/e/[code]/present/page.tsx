import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PresentView } from "@/components/present-view";
import { getEventByCode } from "@/lib/get-event";
import { getShareOrigin } from "@/lib/share-origin";

export async function generateMetadata({ params }: PageProps<"/e/[code]/present">): Promise<Metadata> {
  const { code } = await params;
  const event = await getEventByCode(code);
  return { title: event ? `${event.title} — Present` : "Event not found" };
}

export default async function PresentPage({ params }: PageProps<"/e/[code]/present">) {
  const { code } = await params;
  const [event, shareOrigin] = await Promise.all([getEventByCode(code), getShareOrigin()]);
  if (!event) notFound();
  return <PresentView event={event} shareOrigin={shareOrigin} />;
}
