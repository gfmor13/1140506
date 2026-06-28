const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getSolverSpawnEnv } = require("./solverRuntimeEnv.cjs");

const rootDir = path.resolve(__dirname, "..");
const solverPath = process.env.FSM_SOLVER_PATH
  ? path.resolve(rootDir, process.env.FSM_SOLVER_PATH)
  : path.join(__dirname, process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver");
const wantJson = process.argv.includes("--json");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "test-fixtures", "input-configs", name), "utf8"));
}

function runSolver(inputText) {
  return new Promise((resolve, reject) => {
    const child = spawn(solverPath, [], {
      cwd: rootDir,
      env: getSolverSpawnEnv(process.env),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(inputText);
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function solverJsonForFixture(name) {
  const result = await runSolver(JSON.stringify(readFixture(name)));
  return { result, json: parseJson(result.stdout) };
}

function getEquation(json, target) {
  return (json?.equations ?? []).find((equation) => equation?.target === target || equation?.name === target);
}

function getMap(json, target) {
  return (json?.k_maps ?? []).find((map) => map?.target === target || map?.name === target);
}

function groupHasZeroCell(map, group) {
  const cells = new Map((map.cells ?? []).map((cell) => [cell.id ?? cell.minterm, cell]));
  return (group.cells ?? []).some((cellId) => String(cells.get(cellId)?.value) === "0");
}

function allKMapGroupsAvoidZero(results) {
  return results.every((json) =>
    (json?.k_maps ?? []).every((map) => (map.groups ?? []).every((group) => !groupHasZeroCell(map, group))),
  );
}

function allOneCellsCovered(results) {
  return results.every((json) =>
    (json?.k_maps ?? []).every((map) => {
      const covered = new Set((map.groups ?? []).flatMap((group) => group.cells ?? []));
      return (map.cells ?? []).every((cell) => String(cell.value) !== "1" || covered.has(cell.id ?? cell.minterm));
    }),
  );
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function mapsAlignWithEquationsAndSizes(results) {
  return results.every((json) =>
    (json?.k_maps ?? []).every((map) => {
      const equation = getEquation(json, map.target ?? map.name);
      return (
        equation?.expression === map.expression &&
        (map.groups ?? []).every((group) => group.size === group.cells?.length && isPowerOfTwo(group.size))
      );
    }),
  );
}

function hasDontCareCell(json) {
  return (json?.k_maps ?? []).some((map) => (map.cells ?? []).some((cell) => cell.value === "X"));
}

function hasWrapGroup(map) {
  return (map.groups ?? []).some((group) => {
    const cols = new Set(group.cells.map((cellId) => map.cells.find((cell) => cell.id === cellId)?.col));
    return cols.has("00") && cols.has("10");
  });
}

function incomingEdges(json, endpoint) {
  return (json?.circuit_layout?.edges ?? []).filter((edge) => edge.to === endpoint);
}

function hasNodeType(json, typeName) {
  return (json?.circuit_layout?.nodes ?? []).some((node) => nodeType(node) === typeName);
}

function jkPinsDriven(json, suffix = "A") {
  return incomingEdges(json, `ff_${suffix}.J`).length > 0 && incomingEdges(json, `ff_${suffix}.K`).length > 0;
}

function srPinsDriven(json, suffix = "A") {
  return incomingEdges(json, `ff_${suffix}.S`).length > 0 && incomingEdges(json, `ff_${suffix}.R`).length > 0;
}

function nodeType(node) {
  return String(node.type ?? "").toUpperCase();
}

function evaluateExpression(expression, row = {}, variables = []) {
  const text = String(expression ?? "").trim();
  if (text === "1") return true;
  if (!text || text === "0") return false;
  const sortedVariables = [...variables].sort((a, b) => b.length - a.length);
  return text.split("+").some((rawTerm) => {
    const term = rawTerm.trim();
    if (term === "1") return true;
    if (!term || term === "0") return false;
    let pos = 0;
    const literals = [];
    while (pos < term.length) {
      if (/\s/.test(term[pos])) {
        pos += 1;
        continue;
      }
      const variable = sortedVariables.find((item) => term.startsWith(item, pos));
      if (!variable) return false;
      pos += variable.length;
      const inverted = term[pos] === "#";
      if (inverted) pos += 1;
      literals.push({ variable, inverted });
    }
    return literals.every(({ variable, inverted }) => String(row[variable]) === (inverted ? "0" : "1"));
  });
}

function noSrOverlap(json, suffix = "A") {
  const sEquation = getEquation(json, `S_${suffix}`);
  const rEquation = getEquation(json, `R_${suffix}`);
  if (!sEquation || !rEquation) return false;
  const stateCount = Number(json?.metadata?.state_count ?? 0);
  return (sEquation.truth_table ?? []).every((row) => {
    const stateBits = (sEquation.variables ?? [])
      .filter((variable) => String(variable).startsWith("Q_"))
      .map((variable) => String(row[variable] ?? "0"))
      .join("");
    const presentIndex = Number.parseInt(stateBits || "0", 2);
    if (presentIndex >= stateCount) return true;
    const s = evaluateExpression(sEquation.expression, row, sEquation.variables);
    const r = evaluateExpression(rEquation.expression, row, rEquation.variables);
    return !(s && r);
  });
}

function signalValues(json, name) {
  return (json?.timing_diagram?.signals ?? []).find((signal) => signal?.name === name)?.values ?? [];
}

function hasCoreSections(json) {
  return Boolean(
    json?.equations?.length &&
      json?.k_maps?.length &&
      json?.state_graph &&
      json?.timing_diagram &&
      json?.circuit_layout,
  );
}

function circuitTopologyPasses(simplifyX, constant0, constant1, xor) {
  const hasDrivers = [simplifyX, constant0, constant1, xor].every((json) =>
    (json?.circuit_layout?.nodes ?? []).every((node) => {
      const type = nodeType(node);
      if (type === "OUTPUT_PIN") return incomingEdges(json, `${node.id}.IN`).length > 0;
      if (type === "D_FF") return incomingEdges(json, `${node.id}.D`).length > 0;
      if (["AND", "OR", "NOT", "CONSTANT"].includes(type)) {
        return (json.circuit_layout?.edges ?? []).some((edge) => edge.from === `${node.id}.OUT`);
      }
      return true;
    }),
  );
  const simplifyXHasNoAndOr = !(simplifyX.circuit_layout?.nodes ?? []).some((node) =>
    ["AND", "OR"].includes(nodeType(node)),
  );
  const constant0Driver = incomingEdges(constant0, "out_Y.IN").some((edge) => edge.label === "0");
  const constant1Driver = incomingEdges(constant1, "out_Y.IN").some((edge) => edge.label === "1");
  const xorComplementSource = (xor.circuit_layout?.edges ?? []).some((edge) => edge.from === "ff_A.Q#");
  return hasDrivers && simplifyXHasNoAndOr && constant0Driver && constant1Driver && xorComplementSource;
}

async function main() {
  const tests = [];

  tests.push({ name: "solver executable exists", pass: fs.existsSync(solverPath), detail: solverPath });

  let emptyParsed;
  let unsupportedParsed;
  let tooManyParsed;
  const data = {};

  if (tests[0].pass) {
    emptyParsed = parseJson((await runSolver("")).stdout);
    unsupportedParsed = parseJson(
      (await runSolver(JSON.stringify({ ...readFixture("state-table-d-simplify-x.json"), ff_type: "BAD" }))).stdout,
    );
    tooManyParsed = parseJson(
      (await runSolver(JSON.stringify(readFixture("state-table-invalid-too-many-states-phase3b.json")))).stdout,
    );
    for (const fixture of [
      "state-table-d-simplify-x.json",
      "state-table-d-simplify-qa.json",
      "state-table-d-xor.json",
      "state-table-d-constant-0.json",
      "state-table-d-constant-1.json",
      "state-table-d-3state-dontcare-simplify.json",
      "state-table-d-4var-wraparound.json",
      "state-table-t-toggle-by-x.json",
      "state-table-t-hold.json",
      "state-table-t-always-toggle.json",
      "state-table-t-moore-output-by-state.json",
      "state-table-t-3state-dontcare.json",
      "state-table-t-invalid-missing-transition.json",
      "state-table-t-invalid-moore-output.json",
      "state-table-jk-set-by-x.json",
      "state-table-jk-reset-by-x.json",
      "state-table-jk-toggle-by-x.json",
      "state-table-jk-hold.json",
      "state-table-jk-always-toggle.json",
      "state-table-jk-moore-output-by-state.json",
      "state-table-jk-3state-dontcare.json",
      "state-table-jk-invalid-missing-transition.json",
      "state-table-jk-invalid-moore-output.json",
      "state-table-sr-set-by-x.json",
      "state-table-sr-reset-by-x.json",
      "state-table-sr-toggle-by-x.json",
      "state-table-sr-hold.json",
      "state-table-sr-always-set.json",
      "state-table-sr-always-reset.json",
      "state-table-sr-moore-output-by-state.json",
      "state-table-sr-3state-dontcare.json",
      "state-table-sr-invalid-missing-transition.json",
      "state-table-sr-invalid-moore-output.json",
      "timing-trace-mealy-d-basic.json",
      "timing-trace-mealy-t-basic.json",
      "timing-trace-mealy-jk-basic.json",
      "timing-trace-mealy-sr-basic.json",
      "timing-trace-moore-d-basic.json",
      "timing-trace-invalid-length-mismatch.json",
      "timing-trace-invalid-nonbinary.json",
      "timing-trace-invalid-too-short.json",
      "timing-trace-requires-more-states.json",
    ]) {
      data[fixture] = (await solverJsonForFixture(fixture)).json;
    }
  }

  const simplifyX = data["state-table-d-simplify-x.json"];
  const simplifyQa = data["state-table-d-simplify-qa.json"];
  const xor = data["state-table-d-xor.json"];
  const constant0 = data["state-table-d-constant-0.json"];
  const constant1 = data["state-table-d-constant-1.json"];
  const threeState = data["state-table-d-3state-dontcare-simplify.json"];
  const fourVar = data["state-table-d-4var-wraparound.json"];
  const tToggle = data["state-table-t-toggle-by-x.json"];
  const tHold = data["state-table-t-hold.json"];
  const tAlways = data["state-table-t-always-toggle.json"];
  const tMoore = data["state-table-t-moore-output-by-state.json"];
  const tThreeState = data["state-table-t-3state-dontcare.json"];
  const tMissingTransition = data["state-table-t-invalid-missing-transition.json"];
  const tInvalidMoore = data["state-table-t-invalid-moore-output.json"];
  const jkSet = data["state-table-jk-set-by-x.json"];
  const jkReset = data["state-table-jk-reset-by-x.json"];
  const jkToggle = data["state-table-jk-toggle-by-x.json"];
  const jkHold = data["state-table-jk-hold.json"];
  const jkAlways = data["state-table-jk-always-toggle.json"];
  const jkMoore = data["state-table-jk-moore-output-by-state.json"];
  const jkThreeState = data["state-table-jk-3state-dontcare.json"];
  const jkMissingTransition = data["state-table-jk-invalid-missing-transition.json"];
  const jkInvalidMoore = data["state-table-jk-invalid-moore-output.json"];
  const srSet = data["state-table-sr-set-by-x.json"];
  const srReset = data["state-table-sr-reset-by-x.json"];
  const srToggle = data["state-table-sr-toggle-by-x.json"];
  const srHold = data["state-table-sr-hold.json"];
  const srAlwaysSet = data["state-table-sr-always-set.json"];
  const srAlwaysReset = data["state-table-sr-always-reset.json"];
  const srMoore = data["state-table-sr-moore-output-by-state.json"];
  const srThreeState = data["state-table-sr-3state-dontcare.json"];
  const srMissingTransition = data["state-table-sr-invalid-missing-transition.json"];
  const srInvalidMoore = data["state-table-sr-invalid-moore-output.json"];
  const traceD = data["timing-trace-mealy-d-basic.json"];
  const traceT = data["timing-trace-mealy-t-basic.json"];
  const traceJk = data["timing-trace-mealy-jk-basic.json"];
  const traceSr = data["timing-trace-mealy-sr-basic.json"];
  const traceMooreD = data["timing-trace-moore-d-basic.json"];
  const traceLengthMismatch = data["timing-trace-invalid-length-mismatch.json"];
  const traceNonbinary = data["timing-trace-invalid-nonbinary.json"];
  const traceTooShort = data["timing-trace-invalid-too-short.json"];
  const traceRequiresMoreStates = data["timing-trace-requires-more-states.json"];
  const okResults = [
    simplifyX,
    simplifyQa,
    xor,
    constant0,
    constant1,
    threeState,
    fourVar,
    tToggle,
    tHold,
    tAlways,
    tMoore,
    tThreeState,
    jkSet,
    jkReset,
    jkToggle,
    jkHold,
    jkAlways,
    jkMoore,
    jkThreeState,
    srSet,
    srReset,
    srToggle,
    srHold,
    srAlwaysSet,
    srAlwaysReset,
    srMoore,
    srThreeState,
    traceD,
    traceT,
    traceJk,
    traceSr,
    traceMooreD,
  ];

  tests.push({ name: "empty stdin returns contract error", pass: emptyParsed?.status === "ERROR" && emptyParsed?.message === "Empty stdin" });
  tests.push({ name: "unsupported FF scope returns Phase 4A error", pass: unsupportedParsed?.status === "ERROR" && unsupportedParsed?.message === "Unsupported solver scope in Phase 4A" });
  tests.push({ name: "too many states returns controlled error", pass: tooManyParsed?.status === "ERROR" && /up to 8 states/i.test(tooManyParsed?.message ?? "") });
  tests.push({ name: "simplify-x status OK", pass: simplifyX?.status === "OK" });
  tests.push({ name: "simplify-x D_A = X", pass: getEquation(simplifyX, "D_A")?.expression === "X" });
  tests.push({ name: "simplify-x Y = X", pass: getEquation(simplifyX, "Y")?.expression === "X" });
  tests.push({ name: "simplify-qa status OK", pass: simplifyQa?.status === "OK" });
  tests.push({ name: "simplify-qa Y = Q_A", pass: getEquation(simplifyQa, "Y")?.expression === "Q_A" });
  tests.push({ name: "xor status OK", pass: xor?.status === "OK" });
  tests.push({ name: "xor expression preserved", pass: getEquation(xor, "Y")?.expression === "XQ_A# + X#Q_A" });
  tests.push({ name: "constant-0 status OK", pass: constant0?.status === "OK" });
  tests.push({ name: "constant-0 expression and groups", pass: getEquation(constant0, "Y")?.expression === "0" && getMap(constant0, "Y")?.groups?.length === 0 });
  tests.push({ name: "constant-1 status OK", pass: constant1?.status === "OK" });
  tests.push({ name: "constant-1 expression and group", pass: getEquation(constant1, "Y")?.expression === "1" && (getMap(constant1, "Y")?.groups?.length ?? 0) > 0 });
  tests.push({ name: "3-state status OK", pass: threeState?.status === "OK" });
  tests.push({ name: "3-state uses 2 state bits", pass: Number(threeState?.metadata?.state_bits) === 2 });
  tests.push({ name: "3-state has don't-care cells", pass: hasDontCareCell(threeState) });
  tests.push({ name: "3-state debug has don't-care minterms", pass: (threeState?.debug?.dont_care_minterms ?? []).length > 0 });
  tests.push({ name: "3-state don't-care simplifies Y = Q_A", pass: getEquation(threeState, "Y")?.expression === "Q_A" });
  tests.push({ name: "4-variable status OK", pass: fourVar?.status === "OK" });
  tests.push({ name: "4-variable uses 3 state bits and 4 variables", pass: Number(fourVar?.metadata?.state_bits) === 3 && getEquation(fourVar, "Y")?.variables?.length === 4 });
  tests.push({ name: "4-variable K-Map rows use Gray code", pass: JSON.stringify(getMap(fourVar, "Y")?.rows) === JSON.stringify(["00", "01", "11", "10"]) });
  tests.push({ name: "4-variable K-Map cols use Gray code", pass: JSON.stringify(getMap(fourVar, "Y")?.cols) === JSON.stringify(["00", "01", "11", "10"]) });
  tests.push({ name: "4-variable wrap expression Q_C#", pass: getEquation(fourVar, "Y")?.expression === "Q_C#" });
  tests.push({ name: "4-variable wrap group exists", pass: hasWrapGroup(getMap(fourVar, "Y") ?? {}) });
  tests.push({ name: "all groups avoid zero cells", pass: allKMapGroupsAvoidZero(okResults) });
  tests.push({ name: "all one cells covered", pass: allOneCellsCovered(okResults) });
  tests.push({ name: "k_map expressions and group sizes align", pass: mapsAlignWithEquationsAndSizes(okResults) });
  tests.push({ name: "circuit topology uses simplified expressions and drivers", pass: circuitTopologyPasses(simplifyX, constant0, constant1, xor) });
  tests.push({ name: "T toggle-by-X status OK", pass: tToggle?.status === "OK" });
  tests.push({ name: "T toggle-by-X T_A = X", pass: getEquation(tToggle, "T_A")?.expression === "X" });
  tests.push({ name: "T toggle circuit has T_FF and T driver", pass: hasNodeType(tToggle, "T_FF") && incomingEdges(tToggle, "ff_A.T").length > 0 });
  tests.push({ name: "T hold T_A = 0 with no groups", pass: getEquation(tHold, "T_A")?.expression === "0" && getMap(tHold, "T_A")?.groups?.length === 0 });
  tests.push({ name: "T always toggle T_A = 1 with full group", pass: getEquation(tAlways, "T_A")?.expression === "1" && (getMap(tAlways, "T_A")?.groups?.length ?? 0) > 0 });
  tests.push({ name: "T Moore output Y = Q_A", pass: getEquation(tMoore, "T_A")?.expression === "X" && getEquation(tMoore, "Y")?.expression === "Q_A" });
  tests.push({ name: "T 3-state has T_A and T_B", pass: Boolean(getEquation(tThreeState, "T_A")) && Boolean(getEquation(tThreeState, "T_B")) });
  tests.push({ name: "T 3-state has don't-care cells", pass: hasDontCareCell(tThreeState) });
  tests.push({ name: "T missing transition returns controlled ERROR", pass: tMissingTransition?.status === "ERROR" && /missing transition/i.test(tMissingTransition?.message ?? "") });
  tests.push({ name: "T Moore inconsistency returns controlled ERROR", pass: tInvalidMoore?.status === "ERROR" && /Moore output inconsistency/i.test(tInvalidMoore?.message ?? "") });
  tests.push({ name: "JK set-by-X status OK", pass: jkSet?.status === "OK" });
  tests.push({ name: "JK set-by-X J_A = X", pass: getEquation(jkSet, "J_A")?.expression === "X" });
  tests.push({ name: "JK set-by-X K_A = 0", pass: getEquation(jkSet, "K_A")?.expression === "0" });
  tests.push({ name: "JK reset-by-X J_A = 0", pass: getEquation(jkReset, "J_A")?.expression === "0" });
  tests.push({ name: "JK reset-by-X K_A = X", pass: getEquation(jkReset, "K_A")?.expression === "X" });
  tests.push({ name: "JK toggle-by-X J_A/K_A = X", pass: getEquation(jkToggle, "J_A")?.expression === "X" && getEquation(jkToggle, "K_A")?.expression === "X" });
  tests.push({ name: "JK hold J_A/K_A = 0", pass: getEquation(jkHold, "J_A")?.expression === "0" && getEquation(jkHold, "K_A")?.expression === "0" });
  tests.push({ name: "JK always toggle J_A/K_A = 1", pass: getEquation(jkAlways, "J_A")?.expression === "1" && getEquation(jkAlways, "K_A")?.expression === "1" });
  tests.push({ name: "JK Moore output Y = Q_A", pass: getEquation(jkMoore, "Y")?.expression === "Q_A" });
  tests.push({ name: "JK 3-state has J/K equations", pass: ["J_A", "K_A", "J_B", "K_B"].every((target) => Boolean(getEquation(jkThreeState, target))) });
  tests.push({ name: "JK 3-state has don't-care cells", pass: hasDontCareCell(jkThreeState) });
  tests.push({ name: "JK circuit has JK_FF and J/K drivers", pass: hasNodeType(jkToggle, "JK_FF") && jkPinsDriven(jkToggle, "A") });
  tests.push({ name: "JK K-Map groups avoid zero cells", pass: allKMapGroupsAvoidZero([jkSet, jkReset, jkToggle, jkHold, jkAlways, jkMoore, jkThreeState]) });
  tests.push({ name: "JK missing transition returns controlled ERROR", pass: jkMissingTransition?.status === "ERROR" && /missing transition/i.test(jkMissingTransition?.message ?? "") });
  tests.push({ name: "JK Moore inconsistency returns controlled ERROR", pass: jkInvalidMoore?.status === "ERROR" && /Moore output inconsistency/i.test(jkInvalidMoore?.message ?? "") });
  tests.push({ name: "SR set-by-X S_A = X", pass: getEquation(srSet, "S_A")?.expression === "X" });
  tests.push({ name: "SR set-by-X R_A = 0", pass: getEquation(srSet, "R_A")?.expression === "0" });
  tests.push({ name: "SR reset-by-X S_A = 0", pass: getEquation(srReset, "S_A")?.expression === "0" });
  tests.push({ name: "SR reset-by-X R_A = X", pass: getEquation(srReset, "R_A")?.expression === "X" });
  tests.push({ name: "SR toggle-by-X safe expressions", pass: getEquation(srToggle, "S_A")?.expression === "XQ_A#" && getEquation(srToggle, "R_A")?.expression === "XQ_A" });
  tests.push({ name: "SR hold S_A/R_A = 0", pass: getEquation(srHold, "S_A")?.expression === "0" && getEquation(srHold, "R_A")?.expression === "0" });
  tests.push({ name: "SR always set safe expression", pass: getEquation(srAlwaysSet, "S_A")?.expression === "Q_A#" && getEquation(srAlwaysSet, "R_A")?.expression === "0" });
  tests.push({ name: "SR always reset safe expression", pass: getEquation(srAlwaysReset, "S_A")?.expression === "0" && getEquation(srAlwaysReset, "R_A")?.expression === "Q_A" });
  tests.push({ name: "SR Moore output Y = Q_A", pass: getEquation(srMoore, "Y")?.expression === "Q_A" });
  tests.push({ name: "SR 3-state has S/R equations", pass: ["S_A", "R_A", "S_B", "R_B"].every((target) => Boolean(getEquation(srThreeState, target))) });
  tests.push({ name: "SR 3-state has don't-care cells", pass: hasDontCareCell(srThreeState) });
  tests.push({ name: "SR circuit has SR_FF and S/R drivers", pass: hasNodeType(srToggle, "SR_FF") && srPinsDriven(srToggle, "A") });
  tests.push({ name: "SR no illegal S/R overlap", pass: [srSet, srReset, srToggle, srHold, srAlwaysSet, srAlwaysReset, srMoore].every((json) => noSrOverlap(json, "A")) && noSrOverlap(srThreeState, "A") && noSrOverlap(srThreeState, "B") });
  tests.push({ name: "SR missing transition returns controlled ERROR", pass: srMissingTransition?.status === "ERROR" && /missing transition/i.test(srMissingTransition?.message ?? "") });
  tests.push({ name: "SR Moore inconsistency returns controlled ERROR", pass: srInvalidMoore?.status === "ERROR" && /Moore output inconsistency/i.test(srInvalidMoore?.message ?? "") });
  tests.push({ name: "Timing Trace Mealy D status OK", pass: traceD?.status === "OK" });
  tests.push({ name: "Timing Trace inference metadata exists", pass: traceD?.metadata?.input_mode === "TIMING_TRACE" && traceD?.metadata?.inference?.strategy === "phase4a_observed_trace_baseline" });
  tests.push({ name: "Timing Trace X signal preserves input", pass: JSON.stringify(signalValues(traceD, "X")) === JSON.stringify(["0", "1", "1", "0"]) });
  tests.push({ name: "Timing Trace Z signal preserves output", pass: JSON.stringify(signalValues(traceD, "Z")) === JSON.stringify(["0", "1", "0", "1"]) });
  tests.push({ name: "Timing Trace generated core sections", pass: hasCoreSections(traceD) });
  tests.push({ name: "Timing Trace Mealy T equations exist", pass: traceT?.status === "OK" && Boolean(getEquation(traceT, "T_A")) });
  tests.push({ name: "Timing Trace Mealy JK equations exist", pass: traceJk?.status === "OK" && Boolean(getEquation(traceJk, "J_A")) && Boolean(getEquation(traceJk, "K_A")) });
  tests.push({ name: "Timing Trace Mealy SR equations are safe", pass: traceSr?.status === "OK" && Boolean(getEquation(traceSr, "S_A")) && Boolean(getEquation(traceSr, "R_A")) && noSrOverlap(traceSr, "A") });
  tests.push({ name: "Timing Trace Moore D has state output", pass: traceMooreD?.status === "OK" && (traceMooreD?.state_graph?.states ?? []).some((state) => state.output !== undefined) });
  tests.push({ name: "Timing Trace length mismatch returns controlled ERROR", pass: traceLengthMismatch?.status === "ERROR" && /length mismatch/i.test(traceLengthMismatch?.message ?? "") });
  tests.push({ name: "Timing Trace nonbinary returns controlled ERROR", pass: traceNonbinary?.status === "ERROR" && /non-binary/i.test(traceNonbinary?.message ?? "") });
  tests.push({ name: "Timing Trace too short returns controlled ERROR", pass: traceTooShort?.status === "ERROR" && /at least 2/i.test(traceTooShort?.message ?? "") });
  tests.push({ name: "Timing Trace requires more states returns controlled ERROR", pass: traceRequiresMoreStates?.status === "ERROR" && /requires more states/i.test(traceRequiresMoreStates?.message ?? "") });
  tests.push({ name: "Timing Trace circuit has target drivers", pass: [traceD, traceT, traceJk, traceSr].every((json) => (json?.circuit_layout?.nodes ?? []).every((node) => {
    const type = nodeType(node);
    if (type === "OUTPUT_PIN") return incomingEdges(json, `${node.id}.IN`).length > 0;
    if (type === "D_FF") return incomingEdges(json, `${node.id}.D`).length > 0;
    if (type === "T_FF") return incomingEdges(json, `${node.id}.T`).length > 0;
    if (type === "JK_FF") return jkPinsDriven(json, node.id.replace(/^ff_/, ""));
    if (type === "SR_FF") return srPinsDriven(json, node.id.replace(/^ff_/, ""));
    return true;
  })) });
  tests.push({ name: "Timing Trace K-Map groups avoid zero and cover ones", pass: allKMapGroupsAvoidZero([traceD, traceT, traceJk, traceSr, traceMooreD]) && allOneCellsCovered([traceD, traceT, traceJk, traceSr, traceMooreD]) });
  tests.push({ name: "Timing Trace inference metadata report is complete", pass: traceD?.metadata?.inference?.fsm_model === "Mealy" && traceD?.metadata?.inference?.ff_type === "D" && traceD?.metadata?.inference?.input_signal === "X" && traceD?.metadata?.inference?.output_signal === "Z" && Array.isArray(traceD?.metadata?.inference?.warnings) });
  tests.push({ name: "Timing Trace state_path exists", pass: JSON.stringify(traceD?.metadata?.inference?.state_path) === JSON.stringify(["S0", "S1", "S0", "S1"]) });
  tests.push({ name: "Timing Trace inference report exists", pass: Boolean(traceD?.debug?.inference_report) });
  tests.push({ name: "Timing Trace report steps include actions", pass: (traceD?.debug?.inference_report?.steps ?? []).length > 0 && (traceD?.debug?.inference_report?.steps ?? []).every((step) => Number.isInteger(step.index) && step.present_state && step.input !== undefined && step.output !== undefined && step.next_state && ["create_transition", "reuse_transition", "split_state", "conflict"].includes(step.action)) });
  tests.push({ name: "Timing Trace state_splits array exists", pass: Array.isArray(traceD?.debug?.inference_report?.state_splits) });
  tests.push({ name: "Timing Trace valid conflicts empty", pass: Array.isArray(traceD?.debug?.inference_report?.conflicts) && traceD.debug.inference_report.conflicts.length === 0 });
  tests.push({ name: "Timing Trace requires-more-states metadata diagnostics", pass: traceRequiresMoreStates?.status === "ERROR" && traceRequiresMoreStates?.metadata?.input_mode === "TIMING_TRACE" && traceRequiresMoreStates?.metadata?.inference?.deterministic === false && Number(traceRequiresMoreStates?.metadata?.inference?.configured_state_count) === 2 && Number(traceRequiresMoreStates?.metadata?.inference?.inferred_state_count) > 2 });
  tests.push({ name: "Timing Trace requires-more-states conflict diagnostics", pass: (traceRequiresMoreStates?.debug?.inference_report?.conflicts ?? []).length > 0 && /same present_state\/input/i.test(traceRequiresMoreStates.debug.inference_report.conflicts[0].reason ?? "") });
  tests.push({ name: "Timing Trace timing diagram source", pass: traceD?.timing_diagram?.source === "timing_trace_input" });
  tests.push({ name: "Timing Trace state graph transition trace steps", pass: (traceD?.state_graph?.transitions ?? []).some((transition) => Array.isArray(transition.trace_steps) && transition.trace_steps.length > 0) });

  const failedTests = tests.filter((test) => !test.pass);
  const summary = {
    status: failedTests.length === 0 ? "OK" : "FAIL",
    passed: tests.length - failedTests.length,
    failed: failedTests.length,
  };

  if (wantJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    for (const test of tests) {
      process.stdout.write(`${test.pass ? "PASS" : "FAIL"} ${test.name}\n`);
      if (!test.pass && test.detail) process.stdout.write(`  ${test.detail}\n`);
    }
    process.stdout.write(`${summary.status}: ${summary.passed}/${tests.length} passed\n`);
  }

  if (failedTests.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  const summary = { status: "FAIL", passed: 0, failed: 95, error: error.message };
  if (wantJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stderr.write(`${error.stack || error.message}\n`);
  }
  process.exitCode = 1;
});
