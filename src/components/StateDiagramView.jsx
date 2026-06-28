import { teacherEncodingLabel } from "../lib/displayLabels.js";
import Panel from "./Panel.jsx";

const NODE_RADIUS = 30;
const EDGE_LABEL_WIDTH = 54;
const EDGE_LABEL_HEIGHT = 18;

function dedupeTransitions(transitions) {
  const byKey = new Map();
  for (const transition of transitions) {
    const key = [transition.from, transition.to, transition.input, transition.output].map((item) => String(item ?? "")).join("|");
    const previous = byKey.get(key);
    if (previous) {
      previous.trace_steps = Array.from(new Set([...(previous.trace_steps ?? []), ...(transition.trace_steps ?? [])]));
    } else {
      byKey.set(key, { ...transition, trace_steps: transition.trace_steps ?? [] });
    }
  }
  return Array.from(byKey.values());
}

function edgeTestId(transition) {
  const clean = (value) => String(value ?? "none").replace(/[^A-Za-z0-9_-]/g, "_");
  return `state-edge-${clean(transition.from)}-${clean(transition.to)}-X${clean(transition.input)}-Z${clean(transition.output)}`;
}

function edgeLabelTestId(transition) {
  const clean = (value) => String(value ?? "none").replace(/[^A-Za-z0-9_-]/g, "_");
  return `state-edge-label-${clean(transition.from)}-${clean(transition.to)}-X${clean(transition.input)}-Z${clean(transition.output)}`;
}

function vector(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { dx, dy, length, ux: dx / length, uy: dy / length, nx: -dy / length, ny: dx / length };
}

function pointOnQuadratic(start, control, end, t = 0.5) {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

function transitionLabel(transition, fsmModel) {
  return fsmModel === "Moore" ? transition.input : `${transition.input}/${transition.output}`;
}

function transitionMeta(transitions) {
  const pairCounts = new Map();
  const directedIndexes = new Map();

  for (const transition of transitions) {
    if (transition.from === transition.to) continue;
    const ordered = [transition.from, transition.to].sort().join("|");
    pairCounts.set(ordered, (pairCounts.get(ordered) ?? 0) + 1);
  }

  return transitions.map((transition) => {
    if (transition.from === transition.to) {
      return { ...transition, edgeOffset: 0, hasReverseOrParallel: false };
    }

    const ordered = [transition.from, transition.to].sort().join("|");
    const directed = `${transition.from}|${transition.to}`;
    const directedIndex = directedIndexes.get(directed) ?? 0;
    directedIndexes.set(directed, directedIndex + 1);

    const hasReverseOrParallel = (pairCounts.get(ordered) ?? 0) > 1;
    const parallelSpread = directedIndex * 14;
    return {
      ...transition,
      edgeOffset: hasReverseOrParallel ? -(74 + parallelSpread) : 0,
      hasReverseOrParallel,
    };
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function EdgeLabel({ transition, x, y, children }) {
  return (
    <g data-testid={edgeLabelTestId(transition)}>
      <rect
        fill="rgba(255,255,255,0.98)"
        height={EDGE_LABEL_HEIGHT}
        rx="4"
        stroke="rgba(15,23,42,0.14)"
        width={EDGE_LABEL_WIDTH}
        x={x - EDGE_LABEL_WIDTH / 2}
        y={y - 13}
      />
      <text fill="#0D9488" fontSize="11" fontWeight="700" textAnchor="middle" x={x} y={y}>
        {children}
      </text>
    </g>
  );
}

export default function StateDiagramView({ result, fsmModel }) {
  const states = result?.stateGraph?.states ?? [];
  const transitions = transitionMeta(dedupeTransitions(result?.stateGraph?.transitions ?? []));
  const inferred = result?.metadata?.input_mode === "TIMING_TRACE";
  const conflicts = result?.debug?.inference_report?.conflicts ?? [];
  const radius = 220;
  const center = { x: 360, y: 280 };
  const positions = new Map(
    states.map((state, index) => {
      const angle = states.length <= 1 ? 0 : (Math.PI * 2 * index) / states.length - Math.PI / 2;
      return [state.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }];
    }),
  );

  return (
    <Panel
      title="State Diagram"
      eyebrow={inferred ? "Inferred from Timing Trace" : fsmModel === "Moore" ? "Moore node output badges" : "Mealy edge labels"}
    >
      {conflicts.length > 0 && (
        <div className="border-b border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--danger)]">
          Inference conflict: {conflicts[0].reason}
        </div>
      )}
      <div className="overflow-auto p-4">
        <svg className="min-h-[560px] min-w-[720px]" data-testid="state-diagram-svg" viewBox="0 0 720 560" role="img">
          <defs>
            <marker id="arrow-cyan" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="5">
              <path d="M0,0 L10,5 L0,10 Z" fill="#1D4ED8" />
            </marker>
          </defs>
          <rect fill="rgba(255,255,255,0.94)" height="560" rx="6" width="720" />
          {transitions.map((transition, index) => {
            const from = positions.get(transition.from) ?? center;
            const to = positions.get(transition.to) ?? center;
            const self = transition.from === transition.to;
            const label = transitionLabel(transition, fsmModel);
            const stepLabel = transition.trace_steps?.length ? `steps: ${transition.trace_steps.join(", ")}` : "";

            if (self) {
              const outwardRaw = vector(center, from);
              const outward = outwardRaw.length < 8 ? { ux: 0, uy: -1, nx: 1, ny: 0 } : outwardRaw;
              const tangent = { x: -outward.uy, y: outward.ux };
              const start = {
                x: from.x + tangent.x * 14 + outward.ux * NODE_RADIUS * 0.72,
                y: from.y + tangent.y * 14 + outward.uy * NODE_RADIUS * 0.72,
              };
              const end = {
                x: from.x - tangent.x * 14 + outward.ux * NODE_RADIUS * 0.72,
                y: from.y - tangent.y * 14 + outward.uy * NODE_RADIUS * 0.72,
              };
              const c1 = {
                x: from.x + tangent.x * 44 + outward.ux * 70,
                y: from.y + tangent.y * 44 + outward.uy * 70,
              };
              const c2 = {
                x: from.x - tangent.x * 44 + outward.ux * 70,
                y: from.y - tangent.y * 44 + outward.uy * 70,
              };
              const labelPoint = {
                x: clamp(from.x + outward.ux * 92, 44, 676),
                y: clamp(from.y + outward.uy * 78, 32, 528),
              };
              return (
                <g data-testid={edgeTestId(transition)} key={`${transition.from}-${index}`}>
                  <path
                    d={`M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`}
                    fill="none"
                    markerEnd="url(#arrow-cyan)"
                    stroke="#1D4ED8"
                    strokeWidth="2"
                  />
                  <EdgeLabel transition={transition} x={labelPoint.x} y={labelPoint.y - 1}>{label}</EdgeLabel>
                  {stepLabel && (
                    <text fill="#64748B" fontSize="9" textAnchor="middle" x={labelPoint.x} y={labelPoint.y + 12}>
                      {stepLabel}
                    </text>
                  )}
                </g>
              );
            }

            const edgeVector = vector(from, to);
            const start = {
              x: from.x + edgeVector.ux * (NODE_RADIUS + 2) + edgeVector.nx * transition.edgeOffset,
              y: from.y + edgeVector.uy * (NODE_RADIUS + 2) + edgeVector.ny * transition.edgeOffset,
            };
            const end = {
              x: to.x - edgeVector.ux * (NODE_RADIUS + 5) + edgeVector.nx * transition.edgeOffset,
              y: to.y - edgeVector.uy * (NODE_RADIUS + 5) + edgeVector.ny * transition.edgeOffset,
            };
            const control = {
              x: (from.x + to.x) / 2 + edgeVector.nx * transition.edgeOffset,
              y: (from.y + to.y) / 2 + edgeVector.ny * transition.edgeOffset,
            };
            const labelPoint = pointOnQuadratic(start, control, end, 0.52);
            return (
              <g data-testid={edgeTestId(transition)} key={`${transition.from}-${transition.to}-${index}`}>
                <path
                  d={`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`}
                  fill="none"
                  markerEnd="url(#arrow-cyan)"
                  stroke="#1D4ED8"
                  strokeWidth="2"
                />
                <EdgeLabel transition={transition} x={labelPoint.x} y={labelPoint.y}>{label}</EdgeLabel>
                {stepLabel && (
                  <text fill="#94A3B8" fontSize="9" textAnchor="middle" x={labelPoint.x} y={labelPoint.y + 14}>
                    {stepLabel}
                  </text>
                )}
              </g>
            );
          })}
          {states.map((state, index) => {
            const position = positions.get(state.id) ?? center;
            const output = transitions.find((transition) => transition.from === state.id)?.output;
            return (
              <g key={state.id}>
                <circle
                  cx={position.x}
                  cy={position.y}
                  fill="rgba(255,255,255,0.96)"
                  r="30"
                  stroke="#2563EB"
                  strokeWidth="2"
                />
                <text fill="#0F172A" fontSize="13" fontWeight="600" textAnchor="middle" x={position.x} y={position.y + 4}>
                  {state.label ?? state.id}
                </text>
                {state.encoding && (
                  <text fill="#94A3B8" fontSize="9" textAnchor="middle" x={position.x} y={position.y + 18}>
                    {teacherEncodingLabel(state.encoding, result)}
                  </text>
                )}
                {fsmModel === "Moore" && (
                  <text fill="#0D9488" fontSize="10" textAnchor="middle" x={position.x} y={position.y + 45}>
                    {output ?? `Z=${index}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Panel>
  );
}
