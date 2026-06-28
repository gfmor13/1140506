import { formatTeacherLogicLabel } from "../lib/displayLabels.js";
import Panel from "./Panel.jsx";

function pathFor(values, width = 560, rowTop = 0) {
  if (!values.length) return "";
  const step = width / Math.max(values.length, 1);
  const high = rowTop + 10;
  const low = rowTop + 34;
  const isHigh = (value) => String(value) === "1";
  let path = `M 0 ${isHigh(values[0]) ? high : low}`;
  values.forEach((value, index) => {
    const y = isHigh(value) ? high : low;
    const nextX = (index + 1) * step;
    path += ` H ${nextX} V ${y}`;
  });
  return path;
}

export default function TimingDiagramView({ result }) {
  const signals = result?.timingDiagram?.signals ?? [];
  const source = result?.timingDiagram?.source;
  const traceLength = result?.timingDiagram?.trace_length ?? signals.find((signal) => signal.name !== "CLK")?.values?.length;
  const stepIndexes =
    result?.timingDiagram?.step_indexes ?? Array.from({ length: Number(traceLength ?? 0) }, (_item, index) => index);
  const conflicts = result?.debug?.inference_report?.conflicts ?? [];

  if (signals.length === 0) {
    return (
      <Panel title="Timing Diagram">
        <div className="p-4 text-xs text-[var(--text-muted)]">No timing data returned.</div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Timing Diagram"
      eyebrow={source === "timing_trace_input" ? "source: timing_trace_input" : "step waveform preview"}
    >
      <div className="border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <span className="mr-3 font-mono">Trace length: {traceLength ?? "-"}</span>
        {conflicts.length > 0 && <span className="text-[var(--danger)]">Inference conflict: {conflicts[0].reason}</span>}
      </div>
      <div className="overflow-auto p-4">
        <svg className="min-h-[340px] min-w-[720px]" viewBox={`0 0 720 ${signals.length * 52 + 58}`} role="img">
          <rect fill="rgba(255,255,255,0.94)" height={signals.length * 52 + 58} rx="8" width="720" />
          <text fill="#64748B" fontSize="11" fontWeight="600" x="18" y="24">
            Step
          </text>
          {stepIndexes.map((step, index) => {
            const x = 104 + (560 / Math.max(stepIndexes.length, 1)) * index + 4;
            return (
              <text fill="#64748B" fontSize="10" key={`step-${step}-${index}`} x={x} y="24">
                {step}
              </text>
            );
          })}
          {signals.map((signal, index) => {
            const y = 50 + index * 52;
            return (
              <g key={signal.name}>
                <text fill="#0284C7" fontSize="12" fontWeight="600" x="18" y={y + 25}>
                  {formatTeacherLogicLabel(signal.name, result)}
                </text>
                <line stroke="rgba(148,163,184,0.14)" x1="92" x2="680" y1={y + 34} y2={y + 34} />
                <path
                  d={pathFor(signal.values ?? [], 560, y)}
                  fill="none"
                  stroke={signal.name === "CLK" ? "#2563EB" : "#0D9488"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.25"
                  transform="translate(104 0)"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
}
