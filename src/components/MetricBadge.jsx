const TONE_CLASS = {
  slate: "border-[var(--border-subtle)] bg-[rgba(100,116,139,0.12)] text-[var(--text-muted)]",
  cyan: "border-[rgba(56,189,248,0.36)] bg-[rgba(56,189,248,0.11)] text-[var(--logic-cyan)]",
  mint: "border-[rgba(45,212,191,0.36)] bg-[var(--primary-soft)] text-[var(--primary)]",
  green: "border-[rgba(52,211,153,0.36)] bg-[rgba(52,211,153,0.12)] text-[var(--logic-green)]",
  violet: "border-[rgba(139,92,246,0.36)] bg-[var(--accent-soft)] text-[var(--accent)]",
  amber: "border-[rgba(251,191,36,0.36)] bg-[rgba(251,191,36,0.12)] text-[var(--warning)]",
  rose: "border-[rgba(251,113,133,0.36)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
};

export default function MetricBadge({ label, value, tone = "slate", title }) {
  return (
    <span
      className={`inline-flex min-h-6 max-w-full items-center gap-1 rounded border px-2 py-1 text-[11px] ${TONE_CLASS[tone] ?? TONE_CLASS.slate}`}
      title={title}
    >
      {label && <span className="text-[var(--text-dim)]">{label}</span>}
      <span className="truncate font-mono">{value ?? "-"}</span>
    </span>
  );
}
