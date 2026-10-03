"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeCode } from "@/lib/utils";
import { Button, Input } from "./ui";

export function JoinForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const code = normalizeCode(value);

  return (
    <form
      className="flex w-full max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!code) return;
        setPending(true);
        router.push(`/e/${code}`);
      }}
    >
      <Input
        aria-label="Event code"
        placeholder="Enter event code, e.g. k7m2xp"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 font-mono text-base"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <Button type="submit" size="lg" disabled={!code} loading={pending}>
        Join
      </Button>
    </form>
  );
}
