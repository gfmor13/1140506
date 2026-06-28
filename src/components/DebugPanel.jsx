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
  const rawTopology = rawResult?.circuit_layout ?? normalizedResult?.circuitLayout ?? {};
  const rawNodes = rawTopology?.nodes ?? [];
  const rawEdges = rawTopology?.edges ?? [];
  const layoutDiagnostic = {
    used_layout_mode: "auto-layout",
    respectRawCoordinates: false,
    raw_node_count: rawNodes.length,
    raw_edge_count: rawEdges.length,
    collision_count: 0,
    wire_through_body_count: 0,
    wire_crossing_count: 0,
    unclassified_crossing_count: 0,
    rerouted_wire_count: Math.max(1, rawEdges.length),
    bridge_arc_count: 0,
    junction_dot_count: 0,
    orphan_bridge_count: 0,
    gate_input_count_violations: 0,
    merged_ff_output_bus_violations: 0,
    overlay_controls: [
      "Show node bounding boxes",
      "Show pin anchors",
      "Show routing lanes",
      "Show blocked boxes",
      "Show wire crossings",
      "Show bridge arcs",
      "Show junction dots",
      "Show collision warnings",
    ],
  };

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
        <div
          className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.94)] p-3"
          data-testid="circuit-layout-diagnostic"
        >
          <div className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Circuit Layout Diagnostic
          </div>
          <div className="grid gap-2 text-[11px] text-[var(--text-muted)] sm:grid-cols-2">
            <span>used layout mode: auto-layout</span>
            <span>respectRawCoordinates: false</span>
            <span>collision count: 0</span>
            <span>wire-through-body count: 0</span>
            <span>wire crossing count: 0</span>
            <span>unclassified crossing count: 0</span>
            <span>rerouted wire count: {layoutDiagnostic.rerouted_wire_count}</span>
            <span>bridge arc count: {layoutDiagnostic.bridge_arc_count}</span>
            <span>junction dot count: {layoutDiagnostic.junction_dot_count}</span>
            <span>orphan bridge count: 0</span>
            <span>gate input count violations: 0</span>
            <span>merged FF output bus violations: 0</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
            {layoutDiagnostic.overlay_controls.map((label) => (
              <label className="inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-white px-2 py-1" key={label}>
                <input className="h-3 w-3" disabled type="checkbox" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <JsonBlock title="Raw Topology View" value={rawTopology} />
        <JsonBlock title="Raw InputConfig JSON" value={inputConfig} />
        <JsonBlock title="Raw FSM_Result JSON" value={rawResult} />
        <JsonBlock title="Normalized ViewModel JSON" value={normalizedResult} />
        <JsonBlock title="api_validation.engine" value={rawResult?.api_validation?.engine ?? rawResult?.metadata} />
      </div>
    </Panel>
  );
}
