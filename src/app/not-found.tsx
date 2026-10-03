import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      </div>
      <ButtonLink href="/" variant="secondary">
        Back home
      </ButtonLink>
    </div>
  );
}
