/** Only allow same-origin relative redirects. */
export function safeNext(value: string | string[] | undefined | null, fallback = "/dashboard") {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
