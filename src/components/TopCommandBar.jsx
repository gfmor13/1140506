const FSM_MODELS = ["Mealy", "Moore"];
const FF_TYPES = ["D", "T", "JK", "SR"];

function controlClass(extra = "") {
  return `h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--border-active)] focus:shadow-[0_0_0_2px_rgba(37,99,235,0.12)] ${extra}`;
}

function NumericField({ label, value, onChange }) {
  return (
    <label className="grid min-w-[74px] gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
      {label}
      <input
        className={controlClass("font-mono")}
        min="1"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="grid min-w-[104px] gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
      {label}
      <select className={controlClass()} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function TopCommandBar({ config, onConfigChange, onCompile, compileState }) {
  const compiling = compileState === "compiling" || compileState === "validating";

  function patch(next) {
    onConfigChange((current) => ({ ...current, ...next }));
  }

  return (
    <header
      className="border-b border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)] lg:px-4"
      data-testid="top-command-bar"
    >
      <div className="mx-auto flex min-h-[72px] max-w-[1800px] flex-col gap-3 xl:h-[78px] xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--primary)] shadow-[0_0_16px_var(--primary)]" />
            <h1 className="text-base font-semibold text-[var(--text-main)]">1140506 EDA</h1>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            FSM digital logic design tool{" "}
            <span className="font-medium text-[var(--logic-cyan)]">1140506林稚婷</span>
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 xl:justify-end">
          <SelectField
            label="FSM Model"
            options={FSM_MODELS}
            value={config.fsmModel}
            onChange={(fsmModel) => patch({ fsmModel })}
          />
          <SelectField
            label="FF Type"
            options={FF_TYPES}
            value={config.ffType}
            onChange={(ffType) => patch({ ffType })}
          />
          <NumericField label="States" value={config.stateCount} onChange={(stateCount) => patch({ stateCount })} />
          <NumericField label="Inputs" value={config.inputCount} onChange={(inputCount) => patch({ inputCount })} />
          <NumericField
            label="Outputs"
            value={config.outputCount}
            onChange={(outputCount) => patch({ outputCount })}
          />
          <button
            className="h-9 rounded-md border border-[rgba(37,99,235,0.62)] bg-[linear-gradient(135deg,var(--primary),var(--logic-cyan))] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition hover:border-[rgba(13,148,136,0.62)] hover:shadow-[0_12px_28px_rgba(13,148,136,0.18),0_8px_22px_rgba(37,99,235,0.20)] disabled:cursor-wait disabled:opacity-75"
            data-testid="compile-button"
            disabled={compiling}
            type="button"
            onClick={onCompile}
          >
            {compiling ? "Synthesizing..." : "Compile / Synthesize"}
          </button>
        </div>
      </div>
    </header>
  );
}
