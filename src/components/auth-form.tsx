"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Input, Label } from "./ui";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      router.replace(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
      return;
    }
    setNotice(`We sent a confirmation link to ${email}. Open it to finish creating your account.`);
    setPending(false);
  }

  return (
    <Card className="w-full max-w-sm p-8">
      <h1 className="text-xl font-semibold text-slate-900">
        {isLogin ? "Sign in to your account" : "Create an organizer account"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {isLogin ? "Manage your events and moderate questions." : "Host unlimited live Q&A sessions."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        <Button type="submit" className="w-full" loading={pending}>
          {isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {isLogin ? "New to AskLive? " : "Already have an account? "}
        <Link
          href={`${isLogin ? "/signup" : "/login"}${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-fuchsia-600 hover:text-fuchsia-500"
        >
          {isLogin ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </Card>
  );
}
