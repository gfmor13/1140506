const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getSolverSpawnEnv } = require("../engine/solverRuntimeEnv.cjs");

const rootDir = path.resolve(__dirname, "..");
const solverPath = process.env.FSM_SOLVER_PATH
  ? path.resolve(rootDir, process.env.FSM_SOLVER_PATH)
  : path.join(rootDir, "engine", process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "test-fixtures", "input-configs", name), "utf8"));
}

function runSolver(name) {
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
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${name} solver exit ${code}: ${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify(readFixture(name)));
  });
}

function getEquation(json, target) {
  return (json.equations ?? []).find((equation) => equation.target === target || equation.name === target);
}

function getMap(json, target) {
  return (json.k_maps ?? []).find((map) => map.target === target || map.name === target);
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function validateMap(json, map) {
  assert.ok(Array.isArray(map.cells) && map.cells.length > 0, `${map.target} cells nonempty`);
  assert.ok(Array.isArray(map.groups), `${map.target} groups array`);
  assert.ok(typeof map.expression === "string" && map.expression.length > 0, `${map.target} expression nonempty`);
  const equation = getEquation(json, map.target ?? map.name);
  assert.equal(map.expression, equation?.expression, `${map.target} k_map.expression equals equation.expression`);

  const cellsById = new Map(map.cells.map((cell) => [cell.id ?? cell.minterm, cell]));
  const oneCells = new Set(
    map.cells.filter((cell) => String(cell.value) === "1").map((cell) => cell.id ?? cell.minterm),
  );
  const coveredOnes = new Set();

  for (const group of map.groups) {
    assert.ok(isPowerOfTwo(group.size), `${map.target} group ${group.id} size power of two`);
    assert.equal(group.size, group.cells.length, `${map.target} group ${group.id} size matches cells`);
    let oneCount = 0;
    for (const cellId of group.cells) {
      const cell = cellsById.get(cellId);
      assert.ok(cell, `${map.target} group ${group.id} references existing cell ${cellId}`);
      assert.notEqual(String(cell.value), "0", `${map.target} group ${group.id} does not include 0 cell`);
      if (String(cell.value) === "1") {
        oneCount += 1;
        coveredOnes.add(cellId);
      }
    }
    assert.ok(oneCount > 0, `${map.target} group ${group.id} includes at least one 1 cell`);
  }

  for (const cellId of oneCells) {
    assert.ok(coveredOnes.has(cellId), `${map.target} 1 cell ${cellId} is covered`);
  }
}

async function main() {
  const fixtures = [
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
    "state-table-jk-set-by-x.json",
    "state-table-jk-reset-by-x.json",
    "state-table-jk-toggle-by-x.json",
    "state-table-jk-hold.json",
    "state-table-jk-always-toggle.json",
    "state-table-jk-moore-output-by-state.json",
    "state-table-jk-3state-dontcare.json",
    "state-table-sr-set-by-x.json",
    "state-table-sr-reset-by-x.json",
    "state-table-sr-toggle-by-x.json",
    "state-table-sr-hold.json",
    "state-table-sr-always-set.json",
    "state-table-sr-always-reset.json",
    "state-table-sr-moore-output-by-state.json",
    "state-table-sr-3state-dontcare.json",
    "timing-trace-mealy-d-basic.json",
    "timing-trace-mealy-t-basic.json",
    "timing-trace-mealy-jk-basic.json",
    "timing-trace-mealy-sr-basic.json",
  ];

  const results = {};
  for (const fixture of fixtures) {
    const json = await runSolver(fixture);
    assert.equal(json.status, "OK", `${fixture} status OK`);
    for (const map of json.k_maps ?? []) {
      validateMap(json, map);
    }
    results[fixture] = json;
  }

  const simplifyX = results["state-table-d-simplify-x.json"];
  assert.equal(getEquation(simplifyX, "D_A").expression, "X", "D_A simplifies to X");

  const simplifyQa = results["state-table-d-simplify-qa.json"];
  assert.equal(getEquation(simplifyQa, "Y").expression, "Q_A", "Y simplifies to Q_A");

  const xor = results["state-table-d-xor.json"];
  assert.equal(getEquation(xor, "Y").expression, "XQ_A# + X#Q_A", "XOR preserved");

  const constant0 = results["state-table-d-constant-0.json"];
  const constant0Y = getMap(constant0, "Y");
  assert.equal(constant0Y.expression, "0", "constant 0 expression");
  assert.equal(constant0Y.groups.length, 0, "constant 0 has no groups");

  const constant1 = results["state-table-d-constant-1.json"];
  const constant1Y = getMap(constant1, "Y");
  assert.equal(constant1Y.expression, "1", "constant 1 expression");
  assert.ok(constant1Y.groups.length > 0, "constant 1 has full-map group");

  const threeState = results["state-table-d-3state-dontcare-simplify.json"];
  assert.ok(
    (threeState.k_maps ?? []).some((map) => map.cells.some((cell) => cell.value === "X")),
    "3-state has don't-care cells",
  );
  assert.equal(getEquation(threeState, "Y").expression, "Q_A", "3-state don't-care simplifies Y to Q_A");
  assert.ok((threeState.debug?.dont_care_minterms ?? []).length > 0, "debug has don't-care minterms");

  const fourVar = results["state-table-d-4var-wraparound.json"];
  const fourVarY = getMap(fourVar, "Y");
  assert.deepEqual(fourVarY.rows, ["00", "01", "11", "10"], "4-variable rows use Gray code");
  assert.deepEqual(fourVarY.cols, ["00", "01", "11", "10"], "4-variable cols use Gray code");
  assert.equal(getEquation(fourVar, "Y").expression, "Q_C#", "4-variable wrap expression");
  assert.ok(
    fourVarY.groups.some((group) => {
      const cols = new Set(group.cells.map((cellId) => fourVarY.cells.find((cell) => cell.id === cellId)?.col));
      return cols.has("00") && cols.has("10");
    }),
    "4-variable group uses left-right wrap columns",
  );

  const tToggle = results["state-table-t-toggle-by-x.json"];
  assert.equal(getEquation(tToggle, "T_A").expression, "X", "T_A toggle-by-X simplifies to X");
  assert.ok(getMap(tToggle, "T_A").cells.length > 0, "T_A K-Map cells exist");

  const tHold = results["state-table-t-hold.json"];
  const tHoldMap = getMap(tHold, "T_A");
  assert.equal(tHoldMap.expression, "0", "T hold expression");
  assert.equal(tHoldMap.groups.length, 0, "T hold constant 0 has no groups");

  const tAlways = results["state-table-t-always-toggle.json"];
  const tAlwaysMap = getMap(tAlways, "T_A");
  assert.equal(tAlwaysMap.expression, "1", "T always toggle expression");
  assert.ok(tAlwaysMap.groups.length > 0, "T always toggle has full-map group");

  const tMoore = results["state-table-t-moore-output-by-state.json"];
  assert.equal(getEquation(tMoore, "T_A").expression, "X", "T Moore T_A simplifies to X");
  assert.equal(getEquation(tMoore, "Y").expression, "Q_A", "T Moore output simplifies to Q_A");

  const tThreeState = results["state-table-t-3state-dontcare.json"];
  assert.ok(getMap(tThreeState, "T_A").cells.length > 0, "T 3-state T_A K-Map cells exist");
  assert.ok(getMap(tThreeState, "T_B").cells.length > 0, "T 3-state T_B K-Map cells exist");
  assert.ok(
    (tThreeState.k_maps ?? []).some((map) => map.cells.some((cell) => cell.value === "X")),
    "T 3-state has don't-care cells",
  );

  const jkSet = results["state-table-jk-set-by-x.json"];
  assert.equal(getEquation(jkSet, "J_A").expression, "X", "JK set J_A simplifies to X");
  assert.equal(getEquation(jkSet, "K_A").expression, "0", "JK set K_A simplifies to 0");
  assert.ok(getMap(jkSet, "J_A").cells.some((cell) => cell.value === "X"), "JK set has excitation don't-care cells");
  assert.ok(getMap(jkSet, "K_A").cells.some((cell) => cell.value === "X"), "JK set K_A has excitation don't-care cells");

  const jkReset = results["state-table-jk-reset-by-x.json"];
  assert.equal(getEquation(jkReset, "J_A").expression, "0", "JK reset J_A simplifies to 0");
  assert.equal(getEquation(jkReset, "K_A").expression, "X", "JK reset K_A simplifies to X");

  const jkToggle = results["state-table-jk-toggle-by-x.json"];
  assert.equal(getEquation(jkToggle, "J_A").expression, "X", "JK toggle J_A simplifies to X");
  assert.equal(getEquation(jkToggle, "K_A").expression, "X", "JK toggle K_A simplifies to X");
  assert.ok(getMap(jkToggle, "J_A").cells.length > 0, "JK toggle J_A K-Map cells exist");
  assert.ok(getMap(jkToggle, "K_A").cells.length > 0, "JK toggle K_A K-Map cells exist");

  const jkHold = results["state-table-jk-hold.json"];
  assert.equal(getMap(jkHold, "J_A").expression, "0", "JK hold J_A constant 0");
  assert.equal(getMap(jkHold, "K_A").expression, "0", "JK hold K_A constant 0");
  assert.equal(getMap(jkHold, "J_A").groups.length, 0, "JK hold J_A has no groups");
  assert.equal(getMap(jkHold, "K_A").groups.length, 0, "JK hold K_A has no groups");

  const jkAlways = results["state-table-jk-always-toggle.json"];
  assert.equal(getMap(jkAlways, "J_A").expression, "1", "JK always J_A constant 1");
  assert.equal(getMap(jkAlways, "K_A").expression, "1", "JK always K_A constant 1");
  assert.ok(getMap(jkAlways, "J_A").groups.length > 0, "JK always J_A has valid coverage");
  assert.ok(getMap(jkAlways, "K_A").groups.length > 0, "JK always K_A has valid coverage");

  const jkMoore = results["state-table-jk-moore-output-by-state.json"];
  assert.equal(getEquation(jkMoore, "J_A").expression, "X", "JK Moore J_A simplifies to X");
  assert.equal(getEquation(jkMoore, "K_A").expression, "X", "JK Moore K_A simplifies to X");
  assert.equal(getEquation(jkMoore, "Y").expression, "Q_A", "JK Moore output simplifies to Q_A");

  const jkThreeState = results["state-table-jk-3state-dontcare.json"];
  for (const target of ["J_A", "K_A", "J_B", "K_B"]) {
    assert.ok(getMap(jkThreeState, target).cells.length > 0, `JK 3-state ${target} K-Map cells exist`);
  }
  assert.ok(
    (jkThreeState.k_maps ?? []).some((map) => map.cells.some((cell) => cell.value === "X")),
    "JK 3-state has don't-care cells",
  );
  assert.ok((jkThreeState.debug?.dont_care_minterms ?? []).length > 0, "JK 3-state debug has unused don't-care minterms");

  const srSet = results["state-table-sr-set-by-x.json"];
  assert.equal(getEquation(srSet, "S_A").expression, "X", "SR set S_A simplifies to X");
  assert.equal(getEquation(srSet, "R_A").expression, "0", "SR set R_A simplifies to 0");
  assert.ok(getMap(srSet, "S_A").cells.some((cell) => cell.value === "X"), "SR set S_A has excitation don't-care cells");
  assert.ok(getMap(srSet, "R_A").cells.some((cell) => cell.value === "X"), "SR set R_A has excitation don't-care cells");

  const srReset = results["state-table-sr-reset-by-x.json"];
  assert.equal(getEquation(srReset, "S_A").expression, "0", "SR reset S_A simplifies to 0");
  assert.equal(getEquation(srReset, "R_A").expression, "X", "SR reset R_A simplifies to X");

  const srToggle = results["state-table-sr-toggle-by-x.json"];
  assert.equal(getEquation(srToggle, "S_A").expression, "XQ_A#", "SR toggle S_A remains safe");
  assert.equal(getEquation(srToggle, "R_A").expression, "XQ_A", "SR toggle R_A remains safe");
  assert.ok(getMap(srToggle, "S_A").cells.length > 0, "SR toggle S_A K-Map cells exist");
  assert.ok(getMap(srToggle, "R_A").cells.length > 0, "SR toggle R_A K-Map cells exist");

  const srHold = results["state-table-sr-hold.json"];
  assert.equal(getMap(srHold, "S_A").expression, "0", "SR hold S_A constant 0");
  assert.equal(getMap(srHold, "R_A").expression, "0", "SR hold R_A constant 0");
  assert.equal(getMap(srHold, "S_A").groups.length, 0, "SR hold S_A has no groups");
  assert.equal(getMap(srHold, "R_A").groups.length, 0, "SR hold R_A has no groups");

  const srAlwaysSet = results["state-table-sr-always-set.json"];
  assert.equal(getEquation(srAlwaysSet, "S_A").expression, "Q_A#", "SR always set S_A safe expression");
  assert.equal(getEquation(srAlwaysSet, "R_A").expression, "0", "SR always set R_A stays 0");

  const srAlwaysReset = results["state-table-sr-always-reset.json"];
  assert.equal(getEquation(srAlwaysReset, "S_A").expression, "0", "SR always reset S_A stays 0");
  assert.equal(getEquation(srAlwaysReset, "R_A").expression, "Q_A", "SR always reset R_A safe expression");

  const srMoore = results["state-table-sr-moore-output-by-state.json"];
  assert.equal(getEquation(srMoore, "S_A").expression, "XQ_A#", "SR Moore S_A safe expression");
  assert.equal(getEquation(srMoore, "R_A").expression, "XQ_A", "SR Moore R_A safe expression");
  assert.equal(getEquation(srMoore, "Y").expression, "Q_A", "SR Moore output simplifies to Q_A");

  const srThreeState = results["state-table-sr-3state-dontcare.json"];
  for (const target of ["S_A", "R_A", "S_B", "R_B"]) {
    assert.ok(getMap(srThreeState, target).cells.length > 0, `SR 3-state ${target} K-Map cells exist`);
  }
  assert.ok(
    (srThreeState.k_maps ?? []).some((map) => map.cells.some((cell) => cell.value === "X")),
    "SR 3-state has don't-care cells",
  );
  assert.ok((srThreeState.debug?.dont_care_minterms ?? []).length > 0, "SR 3-state debug has unused don't-care minterms");

  const traceD = results["timing-trace-mealy-d-basic.json"];
  assert.equal(traceD.metadata?.input_mode, "TIMING_TRACE", "Timing Trace D metadata");
  assert.ok(getMap(traceD, "D_A").cells.length > 0, "Timing Trace D_A K-Map cells exist");
  assert.ok(getMap(traceD, "Z").cells.length > 0, "Timing Trace Z K-Map cells exist");

  const traceT = results["timing-trace-mealy-t-basic.json"];
  assert.ok(getMap(traceT, "T_A").cells.length > 0, "Timing Trace T_A K-Map cells exist");

  const traceJk = results["timing-trace-mealy-jk-basic.json"];
  assert.ok(getMap(traceJk, "J_A").cells.length > 0, "Timing Trace J_A K-Map cells exist");
  assert.ok(getMap(traceJk, "K_A").cells.length > 0, "Timing Trace K_A K-Map cells exist");

  const traceSr = results["timing-trace-mealy-sr-basic.json"];
  assert.ok(getMap(traceSr, "S_A").cells.length > 0, "Timing Trace S_A K-Map cells exist");
  assert.ok(getMap(traceSr, "R_A").cells.length > 0, "Timing Trace R_A K-Map cells exist");

  console.log("k-map group tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
