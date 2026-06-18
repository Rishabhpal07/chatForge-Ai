import Link from "next/link";

/** Shared visual primitives — Forge Dark Mode System (from the Stitch "agent" design). */

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`glass-card ${className}`}>{children}</div>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-headline-lg font-bold tracking-tight text-on-surface">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-body-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-body-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "bg-primary-container text-on-primary-container hover:opacity-90",
  ghost:
    "linear-border bg-surface-container-high text-on-surface hover:bg-surface-bright",
} as const;

type BtnProps = {
  variant?: keyof typeof variants;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "primary", className = "", children, ...props }: BtnProps) {
  return (
    <button className={`${btnBase} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof variants;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${btnBase} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400",
  draft: "bg-amber-500/10 text-amber-400",
  disabled: "bg-surface-container-highest text-on-surface-variant",
  ready: "bg-emerald-500/10 text-emerald-400",
  partially_ready: "bg-primary/10 text-primary",
  processing: "bg-amber-500/10 text-amber-400",
  pending: "bg-sky-500/10 text-sky-400",
  error: "bg-error-container/30 text-error",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  draft: "bg-amber-400",
  disabled: "bg-on-surface-variant",
  ready: "bg-emerald-400",
  partially_ready: "bg-primary",
  processing: "bg-amber-400",
  pending: "bg-sky-400",
  error: "bg-error",
};

const STATUS_LABEL: Record<string, string> = {
  partially_ready: "indexing",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`label-mono inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
        STATUS_STYLES[status] ?? "bg-surface-container-highest text-on-surface-variant"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-on-surface-variant"}`} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-label-caps mb-1 text-[10px] uppercase tracking-widest text-on-surface-variant">
      {children}
    </p>
  );
}
