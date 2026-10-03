"use client";

import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { useOrigin } from "./question-card";

/** Attendee URL for an event, preferring the server-chosen share origin. */
export function useAttendeeUrl(code: string, shareOrigin?: string | null) {
  const origin = useOrigin();
  const base = shareOrigin || origin;
  return base ? `${base}/e/${code}` : "";
}

export function EventQr({
  code,
  shareOrigin,
  size = 144,
  className,
}: {
  code: string;
  shareOrigin?: string | null;
  size?: number;
  className?: string;
}) {
  const url = useAttendeeUrl(code, shareOrigin);
  return (
    <div className={cn("shrink-0 rounded-xl bg-white p-2.5 shadow-lg", className)}>
      {url ? (
        <QRCodeSVG value={url} size={size} level="M" marginSize={0} title={`Scan to ask: ${url}`} />
      ) : (
        <div style={{ width: size, height: size }} />
      )}
    </div>
  );
}
