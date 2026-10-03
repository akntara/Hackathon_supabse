import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={safeNext(next)} />;
}
