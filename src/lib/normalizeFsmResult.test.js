export const minimalSolverSample = {
  status: "OK",
  metadata: { engine: "phase1_minimal_solver" },
  equations: [{ target: "Y", expression: "Y = XQ_B#" }],
  k_maps: [{ id: "kmap_Y", groups: [{ cells: ["m1"], term: "XQ_B#" }] }],
  state_graph: {
    states: [{ id: "S0" }],
    transitions: [{ from: "S0", to: "S1" }],
  },
  timing_diagram: {
    signals: [{ name: "Q_B", values: [0, 1] }],
  },
  circuit_layout: {
    nodes: [{ id: "and_Y" }],
    edges: [{ from: "ff_B.Q#", to: "and_Y.IN1" }],
  },
  debug: { engine: "phase1_minimal_solver" },
};

export function normalizeTestCases({ normalizeFsmResult, formatLogicLabel }) {
  return [
    {
      name: "empty raw object returns stable shape",
      run(assert) {
        const result = normalizeFsmResult({});
        assert.equal(result.status, "UNKNOWN");
        assert.deepEqual(result.equations, []);
        assert.deepEqual(result.kMaps, []);
        assert.deepEqual(result.stateGraph, { states: [], transitions: [] });
        assert.deepEqual(result.timingDiagram, { signals: [] });
        assert.deepEqual(result.circuitLayout, { nodes: [], edges: [] });
        assert.deepEqual(result.debug, {});
        assert.deepEqual(result.warnings, []);
      },
    },
    {
      name: "raw.k_maps converts to kMaps",
      run(assert) {
        const result = normalizeFsmResult({ k_maps: [{ id: "k0" }] });
        assert.deepEqual(result.kMaps, [{ id: "k0" }]);
      },
    },
    {
      name: "raw.state_graph converts to stateGraph",
      run(assert) {
        const result = normalizeFsmResult({ state_graph: { states: [{ id: "S0" }] } });
        assert.deepEqual(result.stateGraph, { states: [{ id: "S0" }], transitions: [] });
      },
    },
    {
      name: "raw.circuit_layout nodes and edges fallback correctly",
      run(assert) {
        const result = normalizeFsmResult({ circuit_layout: { nodes: "bad" } });
        assert.deepEqual(result.circuitLayout, { nodes: [], edges: [] });
      },
    },
    {
      name: "formatLogicLabel converts complement for display only",
      run(assert) {
        assert.equal(formatLogicLabel("Q_B#"), "Qb'");
        assert.equal(formatLogicLabel("Q_A#"), "Qa'");
        assert.equal(formatLogicLabel("Q_C#"), "Qc'");
        assert.equal(formatLogicLabel("X#"), "X'");
      },
    },
    {
      name: "normalize keeps raw complement marker unchanged",
      run(assert) {
        const result = normalizeFsmResult({ equations: [{ expression: "Y = XQ_B#" }] });
        assert.equal(result.equations[0].expression, "Y = XQ_B#");
      },
    },
    {
      name: "minimal solver sample normalizes",
      run(assert) {
        const result = normalizeFsmResult(minimalSolverSample);
        assert.equal(result.status, "OK");
        assert.equal(result.equations[0].expression, "Y = XQ_B#");
        assert.equal(result.kMaps.length, 1);
        assert.equal(result.stateGraph.states.length, 1);
        assert.equal(result.timingDiagram.signals.length, 1);
        assert.equal(result.circuitLayout.edges[0].from, "ff_B.Q#");
      },
    },
    {
      name: "backward compatible netlist and topology fallback",
      run(assert) {
        const result = normalizeFsmResult({
          stateGraph: { states: [{ id: "S0" }] },
          netlist: { nodes: [{ id: "n0" }] },
          topology: { edges: [{ from: "n0.OUT", to: "n1.IN" }] },
        });
        assert.deepEqual(result.stateGraph, { states: [{ id: "S0" }], transitions: [] });
        assert.deepEqual(result.circuitLayout.nodes, [{ id: "n0" }]);
        assert.deepEqual(result.circuitLayout.edges, [{ from: "n0.OUT", to: "n1.IN" }]);
      },
    },
    {
      name: "new k_map shape normalizes with rows cols and expression",
      run(assert) {
        const result = normalizeFsmResult({
          k_maps: [
            {
              id: "kmap_D_A",
              name: "D_A",
              target: "D_A",
              variables: ["X", "Q_A"],
              rows: ["0", "1"],
              cols: ["0", "1"],
              cells: [{ id: "10", row: "1", col: "0", minterm: "10", value: "1" }],
              groups: [{ id: "g0", cells: ["10"], term: "XQ_A#", size: 1 }],
              expression: "XQ_A#",
            },
          ],
        });
        assert.equal(result.kMaps[0].rows[0], "0");
        assert.equal(result.kMaps[0].cols[1], "1");
        assert.equal(result.kMaps[0].expression, "XQ_A#");
        assert.equal(result.kMaps[0].groups[0].size, 1);
      },
    },
    {
      name: "k_map group warnings detect zero-cell group",
      run(assert) {
        const result = normalizeFsmResult({
          k_maps: [
            {
              id: "kmap_Y",
              cells: [
                { id: "00", value: "0" },
                { id: "01", value: "1" },
              ],
              groups: [{ id: "bad", cells: ["00", "01"], term: "Q_A#" }],
            },
          ],
        });
        assert.match(result.warnings.join("\n"), /contains a 0 cell/i);
      },
    },
    {
      name: "new k_map expression preserves raw complement marker",
      run(assert) {
        const result = normalizeFsmResult({
          k_maps: [{ id: "kmap_Y", expression: "XQ_A#" }],
          equations: [{ target: "Y", expression: "Y = XQ_A#" }],
        });
        assert.equal(result.kMaps[0].expression, "XQ_A#");
        assert.equal(result.equations[0].expression, "Y = XQ_A#");
        assert.equal(formatLogicLabel(result.kMaps[0].expression), "XQa'");
      },
    },
    {
      name: "T equation normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          equations: [
            {
              name: "T_A",
              target: "T_A",
              kind: "ff_input",
              ff_type: "T",
              state_bit: "Q_A",
              expression: "X",
            },
          ],
        });
        assert.equal(result.equations[0].target, "T_A");
        assert.equal(result.equations[0].ff_type, "T");
        assert.equal(result.equations[0].expression, "X");
      },
    },
    {
      name: "T_FF circuit node normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          circuit_layout: {
            nodes: [{ id: "ff_A", type: "T_FF", pins: ["T", "Q", "Q#"] }],
            edges: [{ from: "in_X.OUT", to: "ff_A.T", label: "T_A" }],
          },
        });
        assert.equal(result.circuitLayout.nodes[0].type, "T_FF");
        assert.equal(result.circuitLayout.edges[0].to, "ff_A.T");
      },
    },
    {
      name: "JK equations normalize",
      run(assert) {
        const result = normalizeFsmResult({
          equations: [
            {
              name: "J_A",
              target: "J_A",
              kind: "ff_input",
              ff_type: "JK",
              state_bit: "Q_A",
              pin: "J",
              expression: "X",
            },
            {
              name: "K_A",
              target: "K_A",
              kind: "ff_input",
              ff_type: "JK",
              state_bit: "Q_A",
              pin: "K",
              expression: "XQ_A#",
            },
          ],
        });
        assert.equal(result.equations[0].target, "J_A");
        assert.equal(result.equations[0].ff_type, "JK");
        assert.equal(result.equations[1].target, "K_A");
        assert.equal(result.equations[1].expression, "XQ_A#");
        assert.equal(formatLogicLabel(result.equations[1].expression), "XQa'");
      },
    },
    {
      name: "JK_FF circuit node normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          circuit_layout: {
            nodes: [{ id: "ff_A", type: "JK_FF", pins: ["J", "K", "Q", "Q#"] }],
            edges: [
              { from: "in_X.OUT", to: "ff_A.J", label: "J_A" },
              { from: "in_X.OUT", to: "ff_A.K", label: "K_A" },
            ],
          },
        });
        assert.equal(result.circuitLayout.nodes[0].type, "JK_FF");
        assert.equal(result.circuitLayout.edges[0].to, "ff_A.J");
        assert.equal(result.circuitLayout.edges[1].to, "ff_A.K");
      },
    },
    {
      name: "SR equations normalize",
      run(assert) {
        const result = normalizeFsmResult({
          equations: [
            {
              name: "S_A",
              target: "S_A",
              kind: "ff_input",
              ff_type: "SR",
              state_bit: "Q_A",
              pin: "S",
              expression: "XQ_A#",
            },
            {
              name: "R_A",
              target: "R_A",
              kind: "ff_input",
              ff_type: "SR",
              state_bit: "Q_A",
              pin: "R",
              expression: "XQ_A",
            },
          ],
          debug: {
            warnings: ["SR minimization fallback: illegal S/R overlap avoided"],
          },
        });
        assert.equal(result.equations[0].target, "S_A");
        assert.equal(result.equations[0].ff_type, "SR");
        assert.equal(result.equations[1].target, "R_A");
        assert.equal(result.debug.warnings[0], "SR minimization fallback: illegal S/R overlap avoided");
        assert.equal(formatLogicLabel(result.equations[0].expression), "XQa'");
      },
    },
    {
      name: "SR_FF circuit node normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          circuit_layout: {
            nodes: [{ id: "ff_A", type: "SR_FF", pins: ["S", "R", "Q", "Q#"] }],
            edges: [
              { from: "in_X.OUT", to: "ff_A.S", label: "S_A" },
              { from: "const_R_A_0.OUT", to: "ff_A.R", label: "0" },
            ],
          },
        });
        assert.equal(result.circuitLayout.nodes[0].type, "SR_FF");
        assert.equal(result.circuitLayout.edges[0].to, "ff_A.S");
        assert.equal(result.circuitLayout.edges[1].to, "ff_A.R");
      },
    },
    {
      name: "Timing Trace inference metadata normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          metadata: {
            input_mode: "TIMING_TRACE",
            inference: {
              strategy: "phase4a_observed_trace_baseline",
              trace_length: 4,
              inferred_state_count: 2,
              configured_state_count: 2,
              deterministic: true,
            },
          },
        });
        assert.equal(result.metadata.input_mode, "TIMING_TRACE");
        assert.equal(result.metadata.inference.strategy, "phase4a_observed_trace_baseline");
        assert.equal(result.metadata.inference.trace_length, 4);
      },
    },
    {
      name: "Timing Trace timing diagram source normalizes",
      run(assert) {
        const result = normalizeFsmResult({
          timing_diagram: {
            source: "timing_trace_input",
            signals: [
              { name: "X", values: ["0", "1", "1", "0"] },
              { name: "Z", values: ["0", "1", "0", "1"] },
            ],
          },
        });
        assert.equal(result.timingDiagram.source, "timing_trace_input");
        assert.deepEqual(result.timingDiagram.signals[0].values, ["0", "1", "1", "0"]);
      },
    },
    {
      name: "Timing Trace raw complement marker is preserved",
      run(assert) {
        const result = normalizeFsmResult({
          metadata: { input_mode: "TIMING_TRACE" },
          equations: [{ target: "D_A", expression: "XQ_A#" }],
        });
        assert.equal(result.equations[0].expression, "XQ_A#");
        assert.equal(formatLogicLabel(result.equations[0].expression), "XQa'");
      },
    },
    {
      name: "Timing Trace ERROR diagnostics normalize",
      run(assert) {
        const result = normalizeFsmResult({
          status: "ERROR",
          message: "Timing Trace requires more states than configured",
          metadata: {
            input_mode: "TIMING_TRACE",
            inference: {
              strategy: "phase4a_observed_trace_baseline",
              trace_length: 5,
              configured_state_count: 2,
              inferred_state_count: 3,
              deterministic: false,
            },
          },
          debug: {
            inference_report: {
              steps: [],
              state_splits: [],
              conflicts: [
                {
                  index: 4,
                  present_state: "S0",
                  input: "0",
                  previous_output: "0",
                  current_output: "1",
                  previous_next_state: "S1",
                  required_next_state: "S0",
                  reason: "same present_state/input requires different output or next_state",
                },
              ],
            },
          },
        });
        assert.equal(result.status, "ERROR");
        assert.equal(result.metadata.inference.deterministic, false);
        assert.equal(result.debug.inference_report.conflicts[0].index, 4);
      },
    },
  ];
}
