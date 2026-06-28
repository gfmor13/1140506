import { formatTeacherLogicLabel } from "../lib/displayLabels.js";
import DebugPanel from "./DebugPanel.jsx";
import MetricBadge from "./MetricBadge.jsx";
import Panel from "./Panel.jsx";

const STATUS_TONE = {
  idle: "slate",
  validating: "cyan",
  compiling: "mint",
  success: "green",
  error: "rose",
};

function KeyValue({ label, value, tone }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 border-b border-[rgba(148,163,184,0.10)] py-1.5 last:border-b-0">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span className={`min-w-0 truncate text-right font-mono ${tone ?? "text-[var(--text-muted)]"}`} title={value ?? ""}>
        {value ?? "-"}
      </span>
    </div>
  );
}

function MessageList({ items, emptyText, toneClass }) {
  if (!items?.length) {
    return <p className="text-xs text-[var(--text-muted)]">{emptyText}</p>;
  }

  return (
    <ul className={`space-y-1 text-xs ${toneClass}`}>
      {items.map((item, index) => (
        <li className="rounded border border-current/20 bg-current/5 px-2 py-1" key={`${item}-${index}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function InspectorPanel({
  result,
  apiMeta,
  inputConfig,
  compileState,
  currentInputMode,
  validationErrors = [],
  warnings = [],
  rawResult,
  debugBuffer,
  debugModeActive,
  debugPanelActive,
  detectedJsonType,
  normalizedResult,
  statusText,
}) {
  const equations = result?.equations ?? [];
  const statusTone = STATUS_TONE[compileState] ?? "slate";
  const debugState = debugModeActive ? "active" : debugPanelActive ? "unlocked" : "inactive";
  const inference = result?.metadata?.inference ?? rawResult?.metadata?.inference;
  const inferenceReport =
    result?.debug?.inference_report ?? rawResult?.debug?.inference_report ?? normalizedResult?.debug?.inference_report;
  const conflicts = inferenceReport?.conflicts ?? [];
  const stateSplits = inferenceReport?.state_splits ?? [];
  const firstConflict = conflicts[0];

  return (
    <aside
      className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_18px_42px_rgba(15,23,42,0.08)]"
      data-testid="inspector-panel"
    >
      <div className="border-b border-[var(--border-subtle)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Inspector</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Compile state, validation, and telemetry</p>
          </div>
          <MetricBadge label="" value={compileState} tone={statusTone} />
        </div>
      </div>

      <div className="eda-scrollbar min-h-0 flex-1 space-y-3 overflow-auto p-3 text-xs">
        <Panel title="Compile" eyebrow="current run">
          <div className="p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              <MetricBadge label="status" value={compileState} tone={statusTone} />
              <MetricBadge label="solver" value={result?.status ?? "-"} tone={result?.status === "OK" ? "green" : "slate"} />
              <MetricBadge label="debug" value={debugState} tone={debugPanelActive ? "violet" : "slate"} />
            </div>
            <div className="space-y-0">
              <KeyValue label="Input Mode" value={currentInputMode} />
              <KeyValue label="Detected JSON" value={detectedJsonType ?? "-"} />
              <KeyValue label="Debug Mode" value={debugState} />
              <KeyValue label="Latest Raw Status" value={rawResult?.status} />
              <KeyValue label="Message" value={statusText} tone="text-[var(--text-main)]" />
            </div>
          </div>
        </Panel>

        <Panel title="API" eyebrow="generate-circuit headers">
          <div className="p-3">
            <KeyValue label="HTTP Status" value={apiMeta?.httpStatus} />
            <KeyValue label="Request ID" value={apiMeta?.requestId} />
            <KeyValue label="Engine Time" value={apiMeta?.engineTimeMs ? `${apiMeta.engineTimeMs} ms` : null} />
            <KeyValue label="Engine Latency" value={apiMeta?.engineLatencyMs ? `${apiMeta.engineLatencyMs} ms` : null} />
          </div>
        </Panel>

        {inference && (
          <Panel title="Inference" eyebrow="timing trace">
            <div className="p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                <MetricBadge
                  label="deterministic"
                  value={String(inference.deterministic ?? "-")}
                  tone={inference.deterministic ? "mint" : "rose"}
                />
                <MetricBadge label="splits" value={stateSplits.length} tone={stateSplits.length ? "amber" : "slate"} />
                <MetricBadge label="conflicts" value={conflicts.length} tone={conflicts.length ? "rose" : "green"} />
              </div>
              <KeyValue label="Strategy" value={inference.strategy} />
              <KeyValue label="Trace Length" value={inference.trace_length} />
              <KeyValue label="Configured States" value={inference.configured_state_count} />
              <KeyValue label="Inferred States" value={inference.inferred_state_count} />
              <KeyValue label="FSM Model" value={inference.fsm_model} />
              <KeyValue label="FF Type" value={inference.ff_type} />
              {firstConflict && (
                <div className="mt-3 rounded border border-[rgba(251,113,133,0.38)] bg-[rgba(251,113,133,0.08)] p-2 text-[var(--danger)]">
                  <div className="font-mono text-[11px]">Conflict index {firstConflict.index}</div>
                  <div className="mt-1 text-[11px]">{firstConflict.reason}</div>
                  <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Increase States count and re-run Compile / Synthesize.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}

        <Panel title="Validation Errors" eyebrow="local checks">
          <div className="p-3">
            <MessageList emptyText="None" items={validationErrors} toneClass="text-[var(--danger)]" />
          </div>
        </Panel>

        <Panel title="Warnings" eyebrow="normalization and presentation">
          <div className="p-3">
            <MessageList emptyText="None" items={warnings} toneClass="text-[var(--warning)]" />
          </div>
        </Panel>

        <Panel title="InputConfig" eyebrow="latest normalized request">
          <pre className="eda-scrollbar max-h-48 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-[var(--text-muted)]">
            {JSON.stringify(inputConfig, null, 2)}
          </pre>
        </Panel>

        <Panel title="Equation Summary" eyebrow="display labels">
          <div className="space-y-2 p-3 font-mono text-[var(--primary)]">
            {equations.length === 0 ? (
              <span className="text-[var(--text-muted)]">No result yet</span>
            ) : (
              equations.map((equation, index) => {
                const rawText = typeof equation === "string" ? equation : equation.expression || equation.equation || "";
                return <div key={`${rawText}-${index}`}>{formatTeacherLogicLabel(rawText, result)}</div>;
              })
            )}
          </div>
        </Panel>

        {debugPanelActive && (
          <DebugPanel
            apiMeta={apiMeta}
            inputConfig={inputConfig}
            normalizedResult={normalizedResult ?? result}
            rawResult={rawResult}
          />
        )}

        {debugBuffer?.compile_error && !debugPanelActive && (
          <Panel title="Debug Note" eyebrow="latest internal message">
            <div className="p-3 font-mono text-[11px] text-[var(--text-muted)]">{debugBuffer.compile_error}</div>
          </Panel>
        )}
      </div>
    </aside>
  );
}
