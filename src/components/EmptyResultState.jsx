export default function EmptyResultState() {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center">
      <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[rgba(248,250,252,0.84)] px-6 py-5 text-center shadow-[inset_0_0_28px_rgba(37,99,235,0.04)]">
        <div className="mx-auto mb-3 h-2 w-28 rounded-full bg-[linear-gradient(90deg,var(--primary),var(--logic-cyan),var(--accent))]" />
        <p className="text-sm font-semibold text-[var(--text-main)]">No compiled result</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Build an FSM input and run Compile / Synthesize.
        </p>
      </div>
    </div>
  );
}
