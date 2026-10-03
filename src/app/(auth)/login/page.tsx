import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <>
      {error && (
        <p className="max-w-sm rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          That sign-in link is invalid or has expired. Please try again.
        </p>
      )}
      <AuthForm mode="login" next={safeNext(next)} />
    </>
  );
}
