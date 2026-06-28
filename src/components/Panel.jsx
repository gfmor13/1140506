export default function Panel({ title, eyebrow, children, className = "", actions = null }) {
  return (
    <section
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-[0_14px_34px_rgba(15,23,42,0.08)] ${className}`}
    >
      {(title || eyebrow || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{eyebrow}</div>
            )}
            {title && <h3 className="truncate text-sm font-semibold text-[var(--text-main)]">{title}</h3>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
