"use client";

import { useState } from "react";
import { Button } from "./ui";
import { CheckIcon, CopyIcon } from "./icons";

export function CopyButton({
  value,
  label = "Copy link",
  size = "md",
}: {
  value: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = value.startsWith("/") ? `${window.location.origin}${value}` : value;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button variant="secondary" size={size} onClick={copy} type="button">
      {copied ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
