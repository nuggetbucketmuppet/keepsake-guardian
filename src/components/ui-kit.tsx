import type { ReactNode } from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import type { Severity } from "@/lib/types";

export function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}
export function scoreLabel(score: number): string {
  if (score >= 80) return "Resilient";
  if (score >= 50) return "At Risk";
  return "Critical";
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  glow = "primary",
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  glow?: "primary" | "accent" | "none";
  hover?: boolean;
}) {
  const glowClass = hover && glow === "primary" ? "glow-primary" : hover && glow === "accent" ? "glow-accent" : "";
  return (
    <div
      className={`rounded-lg border border-border bg-card transition-all duration-200 ${glowClass} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "default",
  badge,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "default" | "danger" | "warning" | "success" | "accent";
  badge?: ReactNode;
}) {
  const toneColor =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : tone === "accent"
            ? "text-accent"
            : "text-foreground";
  return (
    <Card className="p-5" glow="primary">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className={`font-display text-3xl font-bold ${toneColor}`}>{value}</span>
        {badge}
      </div>
    </Card>
  );
}

export function ScoreGauge({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const color = scoreColor(score);
  return (
    <div style={{ width: size, height: size }}>
      <CircularProgressbar
        value={score}
        text={`${score}`}
        styles={buildStyles({
          pathColor: color,
          trailColor: "#2a2f3d",
          textColor: color,
          textSize: "26px",
          pathTransitionDuration: 1,
        })}
      />
      {label && <div className="mt-2 text-center text-xs text-muted-foreground">{label}</div>}
    </div>
  );
}

const SEV_STYLES: Record<Severity, string> = {
  low: "bg-success/15 text-success ring-success/40",
  medium: "bg-warning/15 text-warning ring-warning/40",
  high: "bg-[#fb923c]/15 text-[#fb923c] ring-[#fb923c]/40",
  critical: "bg-danger/15 text-danger ring-danger/40",
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${SEV_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

export function ScoreBadge({ score, title }: { score: number; title?: string }) {
  const color = scoreColor(score);
  return (
    <span
      title={title ?? `Resilience score: ${score}/100 — ${scoreLabel(score)}. How well this workflow survives an outage of its dependencies.`}
      className="inline-flex cursor-help items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1"
      style={{ color, backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}66` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {score}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card hover={false} className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card hover={false} className="flex flex-col items-center justify-center border-danger/40 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger ring-1 ring-danger/40">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="font-display text-lg font-bold">Something went wrong</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      )}
    </Card>
  );
}

export function AiLoading({ message }: { message: string }) {
  return (
    <Card hover={false} className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        {[0, 0.6, 1.2].map((d) => (
          <span
            key={d}
            className="absolute h-16 w-16 rounded-full border border-primary"
            style={{ animation: `pulse-ring 1.8s ${d}s ease-out infinite` }}
          />
        ))}
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <motion.p
        className="mt-6 font-mono text-sm text-accent"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      >
        {message}
      </motion.p>
    </Card>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "accent" | "ghost" | "outline" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    accent: "bg-accent text-accent-foreground hover:bg-accent/90",
    danger: "bg-danger text-white hover:bg-danger/90",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    outline: "border border-border bg-transparent text-foreground hover:bg-secondary",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
