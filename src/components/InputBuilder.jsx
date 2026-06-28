const MODES = ["State Table", "Timing Trace", "Import JSON"];

function FieldInput({ value, onChange, mono = false, ariaLabel }) {
  return (
    <input
      aria-label={ariaLabel}
      className={`h-8 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 text-xs text-[var(--text-main)] outline-none transition focus:border-[var(--border-active)] focus:bg-white focus:shadow-[0_0_0_2px_rgba(37,99,235,0.10)] ${
        mono ? "font-mono" : ""
      }`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function StateTableEditor({ config, rows, onRowsChange }) {
  const isMoore = config.fsmModel === "Moore";

  function updateRow(index, patch) {
    onRowsChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="eda-scrollbar min-h-0 overflow-auto rounded-md border border-[var(--border-subtle)]">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[rgba(248,250,252,0.98)] text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
            <tr>
              <th className="border-b border-[var(--border-subtle)] px-2 py-2">Present</th>
              <th className="border-b border-[var(--border-subtle)] px-2 py-2">Next X=0</th>
              {!isMoore && <th className="border-b border-[var(--border-subtle)] px-2 py-2">Z X=0</th>}
              <th className="border-b border-[var(--border-subtle)] px-2 py-2">Next X=1</th>
              <th className="border-b border-[var(--border-subtle)] px-2 py-2">
                {isMoore ? "Z" : "Z X=1"}
              </th>
            </tr>
          </thead>
          <tbody className="bg-[rgba(255,255,255,0.86)]">
            {rows.map((row, index) => (
              <tr key={`${row.presentState}-${index}`} className="hover:bg-[rgba(56,189,248,0.04)]">
                <td className="border-b border-[var(--border-subtle)] px-2 py-2">
                  <FieldInput
                    ariaLabel={`present-state-${index}`}
                    mono
                    value={row.presentState}
                    onChange={(presentState) => updateRow(index, { presentState })}
                  />
                </td>
                <td className="border-b border-[var(--border-subtle)] px-2 py-2">
                  <FieldInput
                    ariaLabel={`next-state-0-${index}`}
                    mono
                    value={row.nextState0}
                    onChange={(nextState0) => updateRow(index, { nextState0 })}
                  />
                </td>
                {!isMoore && (
                  <td className="border-b border-[var(--border-subtle)] px-2 py-2">
                    <FieldInput
                      ariaLabel={`output-0-${index}`}
                      mono
                      value={row.output0 ?? ""}
                      onChange={(output0) => updateRow(index, { output0 })}
                    />
                  </td>
                )}
                <td className="border-b border-[var(--border-subtle)] px-2 py-2">
                  <FieldInput
                    ariaLabel={`next-state-1-${index}`}
                    mono
                    value={row.nextState1}
                    onChange={(nextState1) => updateRow(index, { nextState1 })}
                  />
                </td>
                <td className="border-b border-[var(--border-subtle)] px-2 py-2">
                  <FieldInput
                    ariaLabel={`${isMoore ? "moore-output" : "output-1"}-${index}`}
                    mono
                    value={isMoore ? row.output ?? "" : row.output1 ?? ""}
                    onChange={(value) => updateRow(index, isMoore ? { output: value } : { output1: value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded border border-[rgba(56,189,248,0.20)] bg-[rgba(56,189,248,0.07)] px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
        State aliases: <span className="text-[var(--logic-cyan)]">A = S0, B = S1, AA = S26</span>
      </div>
    </div>
  );
}

function TimingTraceEditor({ timingTrace, onTimingTraceChange }) {
  function patch(update) {
    onTimingTraceChange({ ...timingTrace, ...update });
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-xs font-medium text-[var(--text-muted)]">
        X input
        <textarea
          className="eda-scrollbar min-h-24 resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 font-mono text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--border-active)] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.10)]"
          placeholder="0 1 1 0"
          value={timingTrace.xTrace}
          onChange={(event) => patch({ xTrace: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-[var(--text-muted)]">
        Z output
        <textarea
          className="eda-scrollbar min-h-24 resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 font-mono text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--border-active)] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.10)]"
          placeholder="0,1,0,1"
          value={timingTrace.zTrace}
          onChange={(event) => patch({ zTrace: event.target.value })}
        />
      </label>
      <div className="rounded-md border border-[rgba(45,212,191,0.22)] bg-[var(--primary-soft)] p-3 text-xs text-[var(--text-muted)]">
        Accepts: <span className="font-mono text-[var(--primary)]">0110, 0 1 1 0, 0.1.1.0</span>
      </div>
    </div>
  );
}

function ImportJsonEditor({ importJsonText, onImportJsonTextChange }) {
  return (
    <textarea
      aria-label="import-json"
      className="eda-scrollbar min-h-[340px] flex-1 resize-none rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 font-mono text-xs leading-5 text-[var(--text-main)] outline-none transition focus:border-[var(--border-active)] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.10)]"
      placeholder={'{\n  "input_mode": "STATE_TABLE",\n  "states": ["A", "B"],\n  "transitions": []\n}'}
      value={importJsonText}
      onChange={(event) => onImportJsonTextChange(event.target.value)}
    />
  );
}

export default function InputBuilder({
  config,
  mode,
  onModeChange,
  stateRows,
  onStateRowsChange,
  timingTrace,
  onTimingTraceChange,
  importJsonText,
  onImportJsonTextChange,
  onLoadTeacherExample,
}) {
  return (
    <aside
      className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_18px_42px_rgba(15,23,42,0.08)]"
      data-testid="input-builder"
    >
      <div className="border-b border-[var(--border-subtle)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Input Builder</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">InputConfig contract editor</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="rounded border border-[var(--border-active)] bg-[var(--primary-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--primary)] transition hover:bg-[rgba(37,99,235,0.18)]"
              data-testid="teacher-standard-mode"
              type="button"
              onClick={onLoadTeacherExample}
            >
              Load Teacher Example
            </button>
            <span className="rounded border border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.08)] px-2 py-1 font-mono text-[10px] text-[var(--logic-cyan)]">
              {mode}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 border-b border-[var(--border-subtle)] bg-[rgba(248,250,252,0.88)] p-2">
        {MODES.map((item) => {
          const selected = item === mode;
          return (
            <button
              className={`h-9 rounded-md px-2 text-xs font-medium transition ${
                selected
                  ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-[inset_0_-1px_0_var(--primary)]"
                  : "text-[var(--text-muted)] hover:bg-[rgba(148,163,184,0.08)] hover:text-[var(--text-main)]"
              }`}
              data-testid={`mode-${item.toLowerCase().replace(/\s+/g, "-")}`}
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {mode === "State Table" && (
          <StateTableEditor config={config} rows={stateRows} onRowsChange={onStateRowsChange} />
        )}
        {mode === "Timing Trace" && (
          <TimingTraceEditor timingTrace={timingTrace} onTimingTraceChange={onTimingTraceChange} />
        )}
        {mode === "Import JSON" && (
          <ImportJsonEditor importJsonText={importJsonText} onImportJsonTextChange={onImportJsonTextChange} />
        )}
      </div>
    </aside>
  );
}
