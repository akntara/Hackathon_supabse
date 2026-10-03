import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-linear-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-white shadow-lg shadow-fuchsia-500/25 hover:shadow-fuchsia-500/40 hover:brightness-110 focus-visible:outline-fuchsia-600 disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100",
  secondary:
    "bg-white/80 backdrop-blur text-slate-700 ring-1 ring-inset ring-violet-200 shadow-sm hover:bg-white hover:ring-violet-300 hover:text-violet-700 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-violet-50 hover:text-violet-700 disabled:text-slate-300",
  danger:
    "bg-white text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:text-rose-300",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed whitespace-nowrap";

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "block w-full rounded-lg border-0 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-violet-200/80 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-fuchsia-500 outline-none transition",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "block w-full resize-none rounded-lg border-0 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-violet-200/80 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-fuchsia-500 outline-none transition",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label className={cn("block text-sm font-medium text-slate-700 mb-1.5", className)} {...props} />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/75 shadow-lg shadow-violet-500/5 ring-1 ring-violet-100 backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
}

type BadgeTone = "slate" | "green" | "indigo" | "amber" | "rose";

const tones: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  indigo: "bg-linear-to-r from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-fuchsia-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold text-slate-900", className)}>
      <span className="bg-brand grid size-8 place-items-center rounded-lg text-white shadow-md shadow-fuchsia-500/30">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h8M8 14h5m-9 6 2.6-2.6A2 2 0 0 1 8 17h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14Z"
          />
        </svg>
      </span>
      <span className="tracking-tight">
        Ask<span className="text-gradient">Live</span>
      </span>
    </Link>
  );
}

export function LiveIndicator({ state }: { state: "connecting" | "live" | "offline" }) {
  const label = { connecting: "Connecting", live: "Live", offline: "Reconnecting" }[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="relative flex size-2">
        {state === "live" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            state === "live" ? "bg-emerald-500" : state === "offline" ? "bg-amber-500" : "bg-slate-300",
          )}
        />
      </span>
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-200 bg-white/40 px-6 py-14 text-center backdrop-blur">
      {icon && (
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-linear-to-br from-violet-100 to-pink-100 text-fuchsia-600">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
}) {
  return (
    <div className="inline-flex rounded-xl bg-white/60 p-1 ring-1 ring-violet-100 backdrop-blur">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
            value === opt.value
              ? "bg-linear-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-fuchsia-500/25"
              : "text-slate-600 hover:text-violet-700",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
