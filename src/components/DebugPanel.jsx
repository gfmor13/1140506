import Panel from "./Panel.jsx";

function JsonBlock({ title, value }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">{title}</div>
      <pre className="eda-scrollbar max-h-52 overflow-auto rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.94)] p-2 font-mono text-[10px] leading-4 text-[var(--text-main)]">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  );
}

export default function DebugPanel({ inputConfig, rawResult, normalizedResult, apiMeta }) {
  const inferenceReport =
    rawResult?.debug?.inference_report ?? normalizedResult?.debug?.inference_report ?? {};
  const inferenceSummary = rawResult?.metadata?.inference ?? normalizedResult?.metadata?.inference ?? {};

  return (
    <Panel className="border-[rgba(139,92,246,0.32)]" title="Debug Panel" eyebrow="raw contract view">
      <div className="grid gap-3 p-3" data-testid="debug-panel">
        <div className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.94)] p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">API Metrics</div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
            <span>Latency: {apiMeta?.engineLatencyMs ?? "-"} ms</span>
            <span>Engine: {apiMeta?.engineTimeMs ?? "-"} ms</span>
            <span className="col-span-2 truncate" title={apiMeta?.requestId ?? ""}>
              Request: {apiMeta?.requestId ?? "-"}
            </span>
          </div>
        </div>
        <JsonBlock
          title="Inference Report"
          value={{
            state_path: inferenceSummary.state_path ?? [],
            inferred_transitions: inferenceReport.inferred_transitions ?? rawResult?.debug?.inferred_transitions ?? [],
            steps: inferenceReport.steps ?? [],
            state_splits: inferenceReport.state_splits ?? [],
            conflicts: inferenceReport.conflicts ?? [],
          }}
        />
        <JsonBlock title="Raw InputConfig JSON" value={inputConfig} />
        <JsonBlock title="Raw FSM_Result JSON" value={rawResult} />
        <JsonBlock title="Normalized ViewModel JSON" value={normalizedResult} />
        <JsonBlock title="api_validation.engine" value={rawResult?.api_validation?.engine ?? rawResult?.metadata} />
      </div>
    </Panel>
  );
}
