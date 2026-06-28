const TABS = ["FF Equations", "K-Map", "State Diagram", "Circuit Diagram", "Timing Diagram"];

export default function ResultTabs({ activeTab, onActiveTabChange }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] bg-[rgba(248,250,252,0.88)] px-2 py-1.5">
      {TABS.map((tab) => {
        const active = tab === activeTab;
        return (
          <button
            className={`relative h-8 rounded-md px-3 text-xs font-medium transition ${
              active
                ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-[0_6px_16px_rgba(37,99,235,0.08)]"
                : "text-[var(--text-muted)] hover:bg-[rgba(148,163,184,0.08)] hover:text-[var(--text-main)]"
            }`}
            data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, "-")}`}
            key={tab}
            type="button"
            onClick={() => onActiveTabChange(tab)}
          >
            {tab}
            {active && (
              <span className="absolute inset-x-2 -bottom-1 h-px rounded bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
