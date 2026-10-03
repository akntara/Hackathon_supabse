import { JoinForm } from "@/components/join-form";
import { ButtonLink, Logo } from "@/components/ui";
import { ArrowUpIcon, ChatIcon, EyeOffIcon, PinIcon } from "@/components/icons";
import { getOrganizer } from "@/lib/supabase/server";

const features = [
  {
    icon: ChatIcon,
    title: "No sign-up for attendees",
    body: "Share a link or a 6-character code. Your audience can ask questions instantly from any device.",
    tone: "from-violet-500 to-indigo-500 shadow-violet-500/30",
  },
  {
    icon: ArrowUpIcon,
    title: "Upvotes surface what matters",
    body: "Questions are ranked by the audience in real time, so you always answer the most-wanted first.",
    tone: "from-fuchsia-500 to-pink-500 shadow-fuchsia-500/30",
  },
  {
    icon: EyeOffIcon,
    title: "Moderation built in",
    body: "Pin the current question, mark answers, and hide anything off-topic — everyone sees it live.",
    tone: "from-orange-400 to-amber-500 shadow-orange-500/30",
  },
];

const preview = [
  { body: "How will the new roadmap affect the mobile team?", votes: 42, name: "Priya", pinned: true },
  { body: "Any plans to open-source the design system?", votes: 27, name: "Anonymous" },
  { body: "What's the hiring outlook for next quarter?", votes: 18, name: "Marcus" },
];

export default async function Home() {
  const { user } = await getOrganizer();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-24 size-96 rounded-full bg-violet-400/30 blur-3xl" />
        <div className="absolute right-0 top-0 size-[28rem] rounded-full bg-pink-400/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-96 rounded-full bg-amber-300/25 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/dashboard">Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup">Create an event</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="text-center lg:text-left">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-200 backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-fuchsia-500" />
              </span>
              Real-time audience Q&amp;A
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
              Every voice in the room,{" "}
              <span className="text-gradient">one live question feed.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-600 lg:mx-0">
              Run town halls, conference talks and classes where the audience asks and upvotes
              questions — and you answer what matters most.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 lg:items-start">
              <JoinForm />
              <p className="text-sm text-slate-500">Attending an event? Enter the code shown by the host.</p>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="bg-brand absolute -inset-4 -z-10 rounded-[2rem] opacity-20 blur-2xl" />
            <div className="animate-float rounded-3xl bg-white/80 p-5 shadow-2xl shadow-fuchsia-500/20 ring-1 ring-white backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Q3 All-hands</p>
                  <p className="font-mono text-xs text-slate-500">#k7m2xp</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Live
                </span>
              </div>
              <div className="space-y-2.5">
                {preview.map((q) => (
                  <div
                    key={q.body}
                    className={`flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ${
                      q.pinned ? "ring-2 ring-fuchsia-400" : "ring-slate-100"
                    }`}
                  >
                    <div
                      className={`flex w-10 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 text-xs font-semibold ${
                        q.pinned
                          ? "bg-linear-to-b from-violet-600 to-fuchsia-600 text-white"
                          : "bg-violet-50 text-violet-700"
                      }`}
                    >
                      <ArrowUpIcon className="size-3.5" />
                      {q.votes}
                    </div>
                    <div className="min-w-0">
                      {q.pinned && (
                        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                          <PinIcon className="size-2.5" /> Now answering
                        </span>
                      )}
                      <p className="text-sm leading-5 text-slate-800">{q.body}</p>
                      <p className="mt-1 text-xs text-slate-400">{q.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-5 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, body, tone }) => (
              <div
                key={title}
                className="group rounded-2xl bg-white/70 p-6 shadow-lg shadow-violet-500/5 ring-1 ring-violet-100 backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-xl hover:shadow-fuchsia-500/10"
              >
                <div
                  className={`mb-4 grid size-11 place-items-center rounded-xl bg-linear-to-br text-white shadow-lg ${tone}`}
                >
                  <Icon className="size-5" />
                </div>
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-violet-100 bg-white/50 py-6 text-center text-sm text-slate-500 backdrop-blur">
        AskLive · Built with Next.js &amp; Supabase
      </footer>
    </div>
  );
}
