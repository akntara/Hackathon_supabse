import os from "node:os";
import { headers } from "next/headers";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function lanAddress() {
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const address of list ?? []) {
        if (address.family === "IPv4" && !address.internal) return address.address;
      }
    }
  } catch {
    // Some sandboxes forbid reading network interfaces.
  }
  return null;
}

/**
 * Origin attendees should open, for QR codes and share links. Uses
 * NEXT_PUBLIC_SITE_URL when set; otherwise the request host, swapping
 * localhost for this machine's LAN address so phones on the same Wi-Fi can
 * reach the dev server.
 */
export async function getShareOrigin(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const [hostname, port] = host.split(":");
  if (!LOOPBACK.test(hostname)) return `${proto}://${host}`;

  const lan = lanAddress();
  return lan ? `http://${lan}${port ? `:${port}` : ""}` : null;
}
