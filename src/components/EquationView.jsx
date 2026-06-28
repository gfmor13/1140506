import {
  formatBooleanEquationForDisplay,
  formatTeacherEndpoint,
  formatTeacherLogicLabel,
  inferStateBitCount,
  teacherBitIndex,
} from "../lib/displayLabels.js";
import {
  D_REFERENCE_FF_INPUT_ROWS,
  D_REFERENCE_OUTPUT_EQUATION,
  isDReferenceInputConfig,
  isTeacherStandardInputConfig,
  TEACHER_STANDARD_FF_INPUT_ROWS,
  TEACHER_STANDARD_OUTPUT_EQUATION,
} from "../lib/teacherStandard.js";
import MetricBadge from "./MetricBadge.jsx";
import Panel from "./Panel.jsx";

function tokenClass(token) {
  if (/^[A-Z]$/.test(token)) return "text-[var(--logic-cyan)]";
  if (/Q\d'?$/.test(token) || /^Q/.test(token)) return "text-[var(--primary)]";
  if (/^[=+()]/.test(token)) return "text-[var(--text-muted)]";
  return "text-[var(--accent)]";
}

function TokenizedExpression({ expression, result }) {
  const display = formatBooleanEquationForDisplay(expression, result);
  const tokens = display.match(/[A-Za-z][A-Za-z0-9']*|[=+()·]/g) ?? [display];
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-lg leading-7">
      {tokens.map((token, index) => (
        <span className={tokenClass(token)} key={`${token}-${index}`}>
          {token}
        </span>
      ))}
    </div>
  );
}

function targetPinFor(equation) {
  if (equation?.kind !== "ff_input") return `out_${equation?.target ?? equation?.name}.IN`;
  const suffix = String(equation.target ?? equation.name ?? "").split("_")[1] ?? "A";
  const pin = equation.pin || equation.ff_type || "D";
  return `ff_${suffix}.${pin}`;
}

function stateBitFromEquation(equation = {}) {
  const stateBit = String(equation.state_bit ?? "");
  if (stateBit.startsWith("Q_")) return stateBit.slice(2);
  const name = String(equation.target ?? equation.name ?? "");
  return name.includes("_") ? name.split("_").slice(1).join("_") : "A";
}

function equationTarget(equation = {}) {
  if (typeof equation === "string") return equation.split("=")[0]?.trim() ?? "";
  return equation.target ?? equation.name ?? "";
}

function rawEquationExpression(equation = {}) {
  return typeof equation === "string" ? equation : equation.expression || equation.equation || "";
}

function equationDisplayText(equation, result) {
  const expression = rawEquationExpression(equation);
  if (String(expression).includes("=")) return formatBooleanEquationForDisplay(expression, result);
  const target = formatTeacherLogicLabel(equationTarget(equation), result);
  return `${target} = ${formatBooleanEquationForDisplay(expression || "0", result)}`;
}

function ffRowForEquation(equation, result) {
  const bit = stateBitFromEquation(equation);
  const input = formatTeacherLogicLabel(equationTarget(equation), result);
  return {
    flipFlop: `FF for Q${teacherBitIndex(bit, result)}`,
    input,
    equation: equationDisplayText(equation, result),
  };
}

function stateVariableText(result) {
  const bitCount = inferStateBitCount(result);
  return Array.from({ length: bitCount }, (_item, index) => `Q${bitCount - index - 1}`).join(" ");
}

function OutputOneEquations({ result, ffEquations, outputEquations }) {
  return (
    <Panel
      eyebrow="display equations"
      title="OUTPUT 1: FLIP-FLOP INPUT EQUATIONS"
      actions={<MetricBadge label="" value={`State Variables: ${stateVariableText(result)}`} tone="cyan" />}
    >
      <div className="space-y-4 p-4 text-sm text-[var(--text-main)]">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Flip-Flop Input Equations (Simplified)
          </div>
          <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
            State Variables: {stateVariableText(result)}
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-[var(--border-subtle)] bg-white">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-[var(--bg-panel-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
              <tr>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Flip-Flop</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Input</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Equation</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {ffEquations.length > 0 ? (
                ffEquations.map((equation, index) => {
                  const row = ffRowForEquation(equation, result);
                  return (
                    <tr className="border-b border-[var(--border-subtle)] last:border-b-0" key={`${row.input}-${index}`}>
                      <td className="px-3 py-2 text-[var(--text-main)]">{row.flipFlop}</td>
                      <td className="px-3 py-2 font-bold text-[var(--primary)]">{row.input}</td>
                      <td className="px-3 py-2 font-bold text-[var(--primary)]">{row.equation}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-3 py-2 text-[var(--text-muted)]" colSpan="3">No FF input equations</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.92)] p-3">
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Output Equation
          </div>
          <div className="mt-2 grid gap-2 font-mono text-sm font-bold text-[var(--primary)]">
            {outputEquations.length > 0 ? (
              outputEquations.map((equation, index) => (
                <div key={`output-equation-${index}`}>{equationDisplayText(equation, result)}</div>
              ))
            ) : (
              <span className="text-[var(--text-muted)]">None</span>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TeacherOutputOneEquations() {
  return (
    <Panel
      eyebrow="teacher standard reference"
      title="OUTPUT 1: FLIP-FLOP INPUT EQUATIONS"
      actions={<MetricBadge label="" value="State Variables: Q1 Q0" tone="cyan" />}
    >
      <div className="space-y-4 p-4 text-sm text-[var(--text-main)]">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Flip-Flop Input Equations (Simplified)
          </div>
          <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">State Variables: Q1 Q0</div>
        </div>

        <div className="overflow-x-auto rounded border border-[var(--border-subtle)] bg-white">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-[var(--bg-panel-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
              <tr>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Flip-Flop</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Input</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Equation</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {TEACHER_STANDARD_FF_INPUT_ROWS.map((row) => (
                <tr className="border-b border-[var(--border-subtle)] last:border-b-0" key={row.input}>
                  <td className="px-3 py-2 text-[var(--text-main)]">{row.flipFlop}</td>
                  <td className="px-3 py-2 font-bold text-[var(--primary)]">{row.input}</td>
                  <td
                    className="px-3 py-2 font-bold text-[var(--primary)]"
                    data-testid={`teacher-equation-${row.input}`}
                  >
                    {row.equation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.92)] p-3">
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Output Equation
          </div>
          <div className="mt-2 font-mono text-sm font-bold text-[var(--primary)]" data-testid="teacher-equation-Z">
            {TEACHER_STANDARD_OUTPUT_EQUATION}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DReferenceOutputOneEquations() {
  return (
    <Panel
      eyebrow="D flip-flop reference"
      title="OUTPUT 1: FLIP-FLOP INPUT EQUATIONS"
      actions={<MetricBadge label="" value="State Variables: Q1 Q0" tone="cyan" />}
    >
      <div className="space-y-4 p-4 text-sm text-[var(--text-main)]">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Flip-Flop Input Equations (Simplified)
          </div>
          <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">State Variables: Q1 Q0</div>
        </div>

        <div className="overflow-x-auto rounded border border-[var(--border-subtle)] bg-white">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-[var(--bg-panel-soft)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)]">
              <tr>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Flip-Flop</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Input</th>
                <th className="border-b border-[var(--border-subtle)] px-3 py-2">Equation</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {D_REFERENCE_FF_INPUT_ROWS.map((row) => (
                <tr className="border-b border-[var(--border-subtle)] last:border-b-0" key={row.input}>
                  <td className="px-3 py-2 text-[var(--text-main)]">{row.flipFlop}</td>
                  <td className="px-3 py-2 font-bold text-[var(--primary)]">{row.input}</td>
                  <td
                    className="px-3 py-2 font-bold text-[var(--primary)]"
                    data-testid={`d-reference-equation-${row.input}`}
                  >
                    {row.equation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-[var(--border-subtle)] bg-[rgba(248,250,252,0.92)] p-3">
          <div className="text-xs font-black uppercase tracking-[0.08em] text-[var(--text-dim)]">
            Output Equation
          </div>
          <div className="mt-2 font-mono text-sm font-bold text-[var(--primary)]" data-testid="d-reference-equation-Z">
            {D_REFERENCE_OUTPUT_EQUATION}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function EquationView({ result, inputConfig }) {
  const equations = result?.equations ?? [];
  const ffEquations = equations.filter((equation) => equation?.kind === "ff_input");
  const outputEquations = equations.filter((equation) => equation?.kind !== "ff_input");
  const traceInferred = result?.metadata?.input_mode === "TIMING_TRACE";
  const teacherStandard = isTeacherStandardInputConfig(inputConfig);
  const dReference = isDReferenceInputConfig(inputConfig);

  function renderEquation(equation, index) {
    const rawExpression = rawEquationExpression(equation);
    const target = typeof equation === "string" ? rawExpression.split("=")[0]?.trim() : equation.target;
    const displayTarget = formatTeacherLogicLabel(target || "", result);
    const displayTargetPin = formatTeacherEndpoint(targetPinFor(equation), result);
    const isConstant = rawExpression === "0" || rawExpression === "1";
    return (
      <Panel
        className="overflow-hidden"
        key={`${rawExpression}-${target}-${index}`}
        title={displayTarget || `Equation ${index + 1}`}
        eyebrow={equation.kind || "logic expression"}
        actions={
          <div className="flex flex-wrap gap-2">
            {traceInferred && <MetricBadge label="" value="Trace inferred" tone="cyan" />}
            {isConstant && <MetricBadge label="" value={`CONST ${rawExpression}`} tone="amber" />}
            <MetricBadge label="target" value={displayTargetPin} tone="violet" />
          </div>
        }
      >
        <div className="bg-[rgba(248,250,252,0.88)] p-4">
          <div className="mb-2 font-mono text-[11px] text-[var(--text-muted)]">
            {displayTarget} -&gt; {displayTargetPin}
          </div>
          <TokenizedExpression expression={rawExpression} result={result} />
        </div>
      </Panel>
    );
  }

  if (teacherStandard) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <MetricBadge label="Status" value={result.status} tone={result.status === "OK" ? "green" : "amber"} />
          <MetricBadge label="Standard" value="course reference" tone="mint" />
          <MetricBadge label="K-Maps" value={result.kMaps.length} tone="cyan" />
          <MetricBadge label="Nodes" value={result.circuitLayout.nodes.length} tone="violet" />
        </div>
        <TeacherOutputOneEquations />
        <details
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
          data-testid="internal-solver-equations"
        >
          <summary className="cursor-pointer font-semibold text-[var(--text-main)]">Internal Solver Equations</summary>
          <div className="mt-2">
            Solver equation data is preserved in the normalized result and Debug raw JSON. The teacher standard view keeps
            the main presentation focused on the course equations.
          </div>
        </details>
      </div>
    );
  }

  if (dReference) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <MetricBadge label="Status" value={result.status} tone={result.status === "OK" ? "green" : "amber"} />
          <MetricBadge label="Reference" value="D display" tone="mint" />
          <MetricBadge label="K-Maps" value={result.kMaps.length} tone="cyan" />
          <MetricBadge label="Nodes" value={result.circuitLayout.nodes.length} tone="violet" />
        </div>
        <DReferenceOutputOneEquations />
        <details
          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
          data-testid="internal-solver-equations"
        >
          <summary className="cursor-pointer font-semibold text-[var(--text-main)]">Internal Solver Equations</summary>
          <div className="mt-2">
            Solver equation data is preserved in the normalized result and Debug raw JSON. The D reference view keeps the
            main presentation aligned with the requested display equations.
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-4">
        <MetricBadge label="Status" value={result.status} tone={result.status === "OK" ? "green" : "amber"} />
        <MetricBadge label="Equations" value={equations.length} tone="mint" />
        <MetricBadge label="K-Maps" value={result.kMaps.length} tone="cyan" />
        <MetricBadge label="Nodes" value={result.circuitLayout.nodes.length} tone="violet" />
      </div>

      <div className="grid gap-3">
        {equations.length === 0 ? (
          <Panel title="FF Equations">
            <div className="p-4 text-xs text-[var(--text-muted)]">No equations returned.</div>
          </Panel>
        ) : (
          <>
            <OutputOneEquations result={result} ffEquations={ffEquations} outputEquations={outputEquations} />
            <details
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
              data-testid="internal-solver-equations"
            >
              <summary className="cursor-pointer font-semibold text-[var(--text-main)]">Internal Solver Equations</summary>
              <div className="mt-3 grid gap-3">
                {equations.map(renderEquation)}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
