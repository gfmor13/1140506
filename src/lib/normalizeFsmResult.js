function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStateGraph(value) {
  const graph = asObject(value);
  return {
    ...graph,
    states: asArray(graph.states),
    transitions: asArray(graph.transitions),
  };
}

function normalizeTimingDiagram(value) {
  const diagram = asObject(value);
  return {
    ...diagram,
    signals: asArray(diagram.signals),
  };
}

function normalizeCircuitLayout(rawLayout, rawNetlist, rawTopology) {
  const layout = asObject(rawLayout);
  const netlist = asObject(rawNetlist);
  const topology = asObject(rawTopology);
  const nodes = asArray(layout.nodes).length
    ? asArray(layout.nodes)
    : asArray(netlist.nodes).length
      ? asArray(netlist.nodes)
      : asArray(topology.nodes);
  const edges = asArray(layout.edges).length
    ? asArray(layout.edges)
    : asArray(topology.edges).length
      ? asArray(topology.edges)
      : asArray(netlist.edges);

  return {
    ...layout,
    nodes,
    edges,
  };
}

function buildKMapWarnings(kMaps) {
  const warnings = [];
  for (const map of kMaps) {
    const cells = asArray(asObject(map).cells);
    const groups = asArray(asObject(map).groups);
    const byId = new Map(cells.map((cell) => [cell.id, cell]));
    for (const group of groups) {
      const groupCells = asArray(group?.cells);
      const hasZeroCell = groupCells.some((cellId) => {
        const value = byId.get(cellId)?.value;
        return value === 0 || value === "0";
      });
      if (hasZeroCell) {
        warnings.push(`K-Map group ${group?.id ?? "(unnamed)"} contains a 0 cell and was hidden in the view`);
      }
    }
  }
  return warnings;
}

export function formatLogicLabel(label) {
  return String(label ?? "")
    .replace(/Q_([A-Z])#/g, (_match, bit) => `Q${bit.toLowerCase()}'`)
    .replace(/([A-Za-z0-9])#/g, "$1'");
}

export function normalizeFsmResult(raw) {
  const source = asObject(raw);
  const stateGraph = source.state_graph ?? source.stateGraph;
  const timingDiagram = source.timing_diagram ?? source.timingDiagram;
  const circuitLayout = source.circuit_layout ?? source.circuitLayout;
  const kMaps = asArray(source.k_maps ?? source.kMaps);
  const warnings = [...asArray(source.warnings), ...buildKMapWarnings(kMaps)];

  return {
    status: source.status ?? "UNKNOWN",
    metadata: asObject(source.metadata),
    equations: asArray(source.equations),
    kMaps,
    stateGraph: normalizeStateGraph(stateGraph),
    timingDiagram: normalizeTimingDiagram(timingDiagram),
    circuitLayout: normalizeCircuitLayout(circuitLayout, source.netlist, source.topology),
    debug: asObject(source.debug),
    warnings,
    raw: source,
  };
}
