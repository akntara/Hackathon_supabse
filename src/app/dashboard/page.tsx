import type { Metadata } from "next";
import Link from "next/link";
import { CreateEventForm } from "@/components/create-event-form";
import { ChatIcon } from "@/components/icons";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getOrganizer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function DashboardPage() {
  const { supabase, user } = await getOrganizer();

  const { data: events, error } = await supabase
    .from("events")
    .select("*, questions(count)")
    .eq("organizer_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your events</h1>
          <p className="mt-1 text-sm text-slate-500">Open an event to moderate its questions live.</p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Could not load events: {error.message}
          </p>
        )}

        {!events?.length ? (
          <EmptyState
            icon={<ChatIcon className="size-8" />}
            title="No events yet"
            description="Create your first event to get a shareable link for your audience."
          />
        ) : (
          <ul className="space-y-3">
            {events.map((event) => {
              const count = event.questions?.[0]?.count ?? 0;
              return (
                <li key={event.id}>
                  <Link href={`/dashboard/events/${event.id}`} className="group block">
                    <Card className="flex items-center justify-between gap-4 p-5 transition group-hover:-translate-y-0.5 group-hover:ring-fuchsia-300 group-hover:shadow-xl group-hover:shadow-fuchsia-500/10">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-medium text-slate-900">{event.title}</h3>
                          {event.is_open ? (
                            <Badge tone="green">Open</Badge>
                          ) : (
                            <Badge>Closed</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          <span className="font-mono">{event.code}</span> ·{" "}
                          {dateFormat.format(new Date(event.created_at))}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-slate-900">{count}</div>
                        <div className="text-xs text-slate-500">
                          question{count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <CreateEventForm />
      </aside>
    </div>
  );
}
