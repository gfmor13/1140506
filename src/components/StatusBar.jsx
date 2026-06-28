const TONE_CLASS = {
  idle: "text-[var(--text-muted)]",
  validating: "text-[var(--logic-cyan)]",
  compiling: "text-[var(--primary)]",
  success: "text-[var(--logic-green)]",
  error: "text-[var(--danger)]",
};

function Dot({ active }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        active ? "bg-[var(--primary)] shadow-[0_0_10px_var(--primary)]" : "bg-[var(--text-dim)]"
      }`}
    />
  );
}

function StatusItem({ label, value, active }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Dot active={active} />
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className="truncate font-mono text-[var(--text-muted)]">{value ?? "-"}</span>
    </span>
  );
}

export default function StatusBar({
  compileState,
  statusText,
  backendStatus,
  solverStatus,
  currentInputMode,
  activeResultTab,
  lastCompileTime,
  zoomLevel = "100%",
}) {
  return (
    <footer
      className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--border-subtle)] bg-[rgba(255,255,255,0.98)] px-3 py-1 text-[11px]"
      data-testid="status-bar"
    >
      <div className={`min-w-0 truncate font-medium ${TONE_CLASS[compileState] ?? TONE_CLASS.idle}`}>
        {statusText}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <StatusItem active={backendStatus === "OK"} label="Backend" value={backendStatus} />
        <StatusItem active={solverStatus === "OK"} label="Solver" value={solverStatus ?? "-"} />
        <StatusItem active label="Mode" value={currentInputMode} />
        <StatusItem active label="Tab" value={activeResultTab} />
        <StatusItem label="Last" value={lastCompileTime ?? "-"} />
        <StatusItem label="Zoom" value={zoomLevel} />
      </div>
    </footer>
  );
}
