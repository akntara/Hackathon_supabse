import { JoinForm } from "@/components/join-form";
import { Logo } from "@/components/ui";

export default function EventNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Event not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          Double-check the code with your host and try again.
        </p>
      </div>
      <JoinForm />
    </div>
  );
}
