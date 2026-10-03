import { redirect } from "next/navigation";
import { Button, Logo } from "@/components/ui";
import { getOrganizer } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { user } = await getOrganizer();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-violet-100 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
