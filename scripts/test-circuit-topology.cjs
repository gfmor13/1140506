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

function incomingEdges(json, endpoint) {
  return (json.circuit_layout?.edges ?? []).filter((edge) => edge.to === endpoint);
}

function outgoingEdges(json, endpoint) {
  return (json.circuit_layout?.edges ?? []).filter((edge) => edge.from === endpoint);
}

function nodeType(node) {
  return String(node.type ?? "").toUpperCase();
}

function validateDrivers(json) {
  for (const node of json.circuit_layout?.nodes ?? []) {
    const type = nodeType(node);
    if (type === "OUTPUT_PIN") {
      assert.ok(incomingEdges(json, `${node.id}.IN`).length > 0, `${node.id}.IN has driver`);
    }
    if (type === "D_FF") {
      assert.ok(incomingEdges(json, `${node.id}.D`).length > 0, `${node.id}.D has driver`);
    }
    if (type === "T_FF") {
      assert.ok(incomingEdges(json, `${node.id}.T`).length > 0, `${node.id}.T has driver`);
    }
    if (type === "JK_FF") {
      assert.ok(incomingEdges(json, `${node.id}.J`).length > 0, `${node.id}.J has driver`);
      assert.ok(incomingEdges(json, `${node.id}.K`).length > 0, `${node.id}.K has driver`);
    }
    if (type === "SR_FF") {
      assert.ok(incomingEdges(json, `${node.id}.S`).length > 0, `${node.id}.S has driver`);
      assert.ok(incomingEdges(json, `${node.id}.R`).length > 0, `${node.id}.R has driver`);
    }
    if (["AND", "OR", "NOT", "CONSTANT"].includes(type)) {
      assert.ok(outgoingEdges(json, `${node.id}.OUT`).length > 0, `${node.id}.OUT feeds another node`);
    }
  }
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
      assert.ok(variable, `literal parse failed for ${term}`);
      pos += variable.length;
      const inverted = term[pos] === "#";
      if (inverted) pos += 1;
      literals.push({ variable, inverted });
    }
    return literals.every(({ variable, inverted }) => String(row[variable]) === (inverted ? "0" : "1"));
  });
}

function assertNoSrOverlap(json, suffix = "A") {
  const sEquation = getEquation(json, `S_${suffix}`);
  const rEquation = getEquation(json, `R_${suffix}`);
  assert.ok(sEquation, `S_${suffix} equation exists`);
  assert.ok(rEquation, `R_${suffix} equation exists`);
  for (const row of sEquation.truth_table ?? []) {
    if (String(row.value) === "X") continue;
    const s = evaluateExpression(sEquation.expression, row, sEquation.variables);
    const r = evaluateExpression(rEquation.expression, row, rEquation.variables);
    assert.ok(!(s && r), `SR overlap avoided for ${suffix} at ${JSON.stringify(row)}`);
  }
}

async function main() {
  const simplifyX = await runSolver("state-table-d-simplify-x.json");
  assert.equal(simplifyX.status, "OK");
  assert.equal(getEquation(simplifyX, "D_A").expression, "X");
  validateDrivers(simplifyX);
  assert.ok(
    !(simplifyX.circuit_layout.nodes ?? []).some((node) => ["AND", "OR"].includes(nodeType(node))),
    "D_A = X / Y = X does not generate canonical AND/OR gates",
  );

  const constant0 = await runSolver("state-table-d-constant-0.json");
  validateDrivers(constant0);
  assert.ok(
    (constant0.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "CONSTANT" && node.label === "0"),
    "constant 0 node exists",
  );
  assert.ok(incomingEdges(constant0, "out_Y.IN").some((edge) => edge.label === "0"), "constant 0 drives output");

  const constant1 = await runSolver("state-table-d-constant-1.json");
  validateDrivers(constant1);
  assert.ok(
    (constant1.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "CONSTANT" && node.label === "1"),
    "constant 1 node exists",
  );
  assert.ok(incomingEdges(constant1, "out_Y.IN").some((edge) => edge.label === "1"), "constant 1 drives output");

  const xor = await runSolver("state-table-d-xor.json");
  validateDrivers(xor);
  assert.equal(getEquation(xor, "Y").expression, "XQ_A# + X#Q_A");
  assert.ok(
    (xor.circuit_layout.edges ?? []).some((edge) => edge.from === "ff_A.Q#"),
    "complement literal Q_A# uses ff_A.Q# source",
  );

  const fourVar = await runSolver("state-table-d-4var-wraparound.json");
  validateDrivers(fourVar);
  assert.equal(getEquation(fourVar, "Y").expression, "Q_C#");
  assert.ok(
    (fourVar.circuit_layout.edges ?? []).some((edge) => edge.from === "ff_C.Q#"),
    "4-variable complement literal Q_C# uses ff_C.Q# source",
  );

  const tToggle = await runSolver("state-table-t-toggle-by-x.json");
  validateDrivers(tToggle);
  assert.equal(getEquation(tToggle, "T_A").expression, "X");
  assert.ok(
    (tToggle.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "T_FF" && node.id === "ff_A"),
    "T toggle has T_FF ff_A",
  );
  assert.ok(incomingEdges(tToggle, "ff_A.T").length > 0, "T toggle drives ff_A.T");

  const tHold = await runSolver("state-table-t-hold.json");
  validateDrivers(tHold);
  assert.equal(getEquation(tHold, "T_A").expression, "0");
  assert.ok(
    (tHold.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "CONSTANT" && node.label === "0"),
    "T hold constant 0 node exists",
  );
  assert.ok(incomingEdges(tHold, "ff_A.T").some((edge) => edge.label === "0"), "constant 0 drives ff_A.T");

  const tAlways = await runSolver("state-table-t-always-toggle.json");
  validateDrivers(tAlways);
  assert.equal(getEquation(tAlways, "T_A").expression, "1");
  assert.ok(
    (tAlways.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "CONSTANT" && node.label === "1"),
    "T always constant 1 node exists",
  );
  assert.ok(incomingEdges(tAlways, "ff_A.T").some((edge) => edge.label === "1"), "constant 1 drives ff_A.T");

  const tThreeState = await runSolver("state-table-t-3state-dontcare.json");
  validateDrivers(tThreeState);
  assert.ok(
    (tThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "T_FF" && node.id === "ff_A"),
    "T 3-state has T_FF ff_A",
  );
  assert.ok(
    (tThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "T_FF" && node.id === "ff_B"),
    "T 3-state has T_FF ff_B",
  );
  assert.ok(incomingEdges(tThreeState, "ff_A.T").length > 0, "T 3-state drives ff_A.T");
  assert.ok(incomingEdges(tThreeState, "ff_B.T").length > 0, "T 3-state drives ff_B.T");

  const jkToggle = await runSolver("state-table-jk-toggle-by-x.json");
  validateDrivers(jkToggle);
  assert.equal(getEquation(jkToggle, "J_A").expression, "X");
  assert.equal(getEquation(jkToggle, "K_A").expression, "X");
  assert.ok(
    (jkToggle.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "JK_FF" && node.id === "ff_A"),
    "JK toggle has JK_FF ff_A",
  );
  assert.ok(incomingEdges(jkToggle, "ff_A.J").length > 0, "JK toggle drives ff_A.J");
  assert.ok(incomingEdges(jkToggle, "ff_A.K").length > 0, "JK toggle drives ff_A.K");

  const jkSet = await runSolver("state-table-jk-set-by-x.json");
  validateDrivers(jkSet);
  assert.equal(getEquation(jkSet, "J_A").expression, "X");
  assert.equal(getEquation(jkSet, "K_A").expression, "0");
  assert.ok(incomingEdges(jkSet, "ff_A.K").some((edge) => edge.label === "0"), "JK set constant 0 drives ff_A.K");

  const jkReset = await runSolver("state-table-jk-reset-by-x.json");
  validateDrivers(jkReset);
  assert.equal(getEquation(jkReset, "J_A").expression, "0");
  assert.equal(getEquation(jkReset, "K_A").expression, "X");
  assert.ok(incomingEdges(jkReset, "ff_A.J").some((edge) => edge.label === "0"), "JK reset constant 0 drives ff_A.J");

  const jkHold = await runSolver("state-table-jk-hold.json");
  validateDrivers(jkHold);
  assert.equal(getEquation(jkHold, "J_A").expression, "0");
  assert.equal(getEquation(jkHold, "K_A").expression, "0");
  assert.ok(incomingEdges(jkHold, "ff_A.J").some((edge) => edge.label === "0"), "JK hold constant 0 drives ff_A.J");
  assert.ok(incomingEdges(jkHold, "ff_A.K").some((edge) => edge.label === "0"), "JK hold constant 0 drives ff_A.K");

  const jkAlways = await runSolver("state-table-jk-always-toggle.json");
  validateDrivers(jkAlways);
  assert.equal(getEquation(jkAlways, "J_A").expression, "1");
  assert.equal(getEquation(jkAlways, "K_A").expression, "1");
  assert.ok(incomingEdges(jkAlways, "ff_A.J").some((edge) => edge.label === "1"), "JK always constant 1 drives ff_A.J");
  assert.ok(incomingEdges(jkAlways, "ff_A.K").some((edge) => edge.label === "1"), "JK always constant 1 drives ff_A.K");

  const jkThreeState = await runSolver("state-table-jk-3state-dontcare.json");
  validateDrivers(jkThreeState);
  assert.ok(
    (jkThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "JK_FF" && node.id === "ff_A"),
    "JK 3-state has JK_FF ff_A",
  );
  assert.ok(
    (jkThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "JK_FF" && node.id === "ff_B"),
    "JK 3-state has JK_FF ff_B",
  );
  assert.ok(incomingEdges(jkThreeState, "ff_A.J").length > 0, "JK 3-state drives ff_A.J");
  assert.ok(incomingEdges(jkThreeState, "ff_A.K").length > 0, "JK 3-state drives ff_A.K");
  assert.ok(incomingEdges(jkThreeState, "ff_B.J").length > 0, "JK 3-state drives ff_B.J");
  assert.ok(incomingEdges(jkThreeState, "ff_B.K").length > 0, "JK 3-state drives ff_B.K");

  const srToggle = await runSolver("state-table-sr-toggle-by-x.json");
  validateDrivers(srToggle);
  assert.equal(getEquation(srToggle, "S_A").expression, "XQ_A#");
  assert.equal(getEquation(srToggle, "R_A").expression, "XQ_A");
  assert.ok(
    (srToggle.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "SR_FF" && node.id === "ff_A"),
    "SR toggle has SR_FF ff_A",
  );
  assert.ok(incomingEdges(srToggle, "ff_A.S").length > 0, "SR toggle drives ff_A.S");
  assert.ok(incomingEdges(srToggle, "ff_A.R").length > 0, "SR toggle drives ff_A.R");
  assertNoSrOverlap(srToggle, "A");

  const srSet = await runSolver("state-table-sr-set-by-x.json");
  validateDrivers(srSet);
  assert.equal(getEquation(srSet, "S_A").expression, "X");
  assert.equal(getEquation(srSet, "R_A").expression, "0");
  assert.ok(incomingEdges(srSet, "ff_A.R").some((edge) => edge.label === "0"), "SR set constant 0 drives ff_A.R");
  assertNoSrOverlap(srSet, "A");

  const srReset = await runSolver("state-table-sr-reset-by-x.json");
  validateDrivers(srReset);
  assert.equal(getEquation(srReset, "S_A").expression, "0");
  assert.equal(getEquation(srReset, "R_A").expression, "X");
  assert.ok(incomingEdges(srReset, "ff_A.S").some((edge) => edge.label === "0"), "SR reset constant 0 drives ff_A.S");
  assertNoSrOverlap(srReset, "A");

  const srHold = await runSolver("state-table-sr-hold.json");
  validateDrivers(srHold);
  assert.equal(getEquation(srHold, "S_A").expression, "0");
  assert.equal(getEquation(srHold, "R_A").expression, "0");
  assert.ok(incomingEdges(srHold, "ff_A.S").some((edge) => edge.label === "0"), "SR hold constant 0 drives ff_A.S");
  assert.ok(incomingEdges(srHold, "ff_A.R").some((edge) => edge.label === "0"), "SR hold constant 0 drives ff_A.R");
  assertNoSrOverlap(srHold, "A");

  const srAlwaysSet = await runSolver("state-table-sr-always-set.json");
  validateDrivers(srAlwaysSet);
  assert.equal(getEquation(srAlwaysSet, "S_A").expression, "Q_A#");
  assert.equal(getEquation(srAlwaysSet, "R_A").expression, "0");
  assert.ok(
    (srAlwaysSet.circuit_layout.edges ?? []).some((edge) => edge.from === "ff_A.Q#"),
    "SR always set uses ff_A.Q# complement source",
  );
  assertNoSrOverlap(srAlwaysSet, "A");

  const srAlwaysReset = await runSolver("state-table-sr-always-reset.json");
  validateDrivers(srAlwaysReset);
  assert.equal(getEquation(srAlwaysReset, "S_A").expression, "0");
  assert.equal(getEquation(srAlwaysReset, "R_A").expression, "Q_A");
  assertNoSrOverlap(srAlwaysReset, "A");

  const srThreeState = await runSolver("state-table-sr-3state-dontcare.json");
  validateDrivers(srThreeState);
  assert.ok(
    (srThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "SR_FF" && node.id === "ff_A"),
    "SR 3-state has SR_FF ff_A",
  );
  assert.ok(
    (srThreeState.circuit_layout.nodes ?? []).some((node) => nodeType(node) === "SR_FF" && node.id === "ff_B"),
    "SR 3-state has SR_FF ff_B",
  );
  assert.ok(incomingEdges(srThreeState, "ff_A.S").length > 0, "SR 3-state drives ff_A.S");
  assert.ok(incomingEdges(srThreeState, "ff_A.R").length > 0, "SR 3-state drives ff_A.R");
  assert.ok(incomingEdges(srThreeState, "ff_B.S").length > 0, "SR 3-state drives ff_B.S");
  assert.ok(incomingEdges(srThreeState, "ff_B.R").length > 0, "SR 3-state drives ff_B.R");
  assertNoSrOverlap(srThreeState, "A");
  assertNoSrOverlap(srThreeState, "B");

  const traceD = await runSolver("timing-trace-mealy-d-basic.json");
  validateDrivers(traceD);
  assert.equal(traceD.metadata?.input_mode, "TIMING_TRACE");
  assert.ok(incomingEdges(traceD, "ff_A.D").length > 0, "Timing Trace D drives ff_A.D");
  assert.ok(incomingEdges(traceD, "out_Z.IN").length > 0, "Timing Trace D drives output Z");

  const traceT = await runSolver("timing-trace-mealy-t-basic.json");
  validateDrivers(traceT);
  assert.ok(incomingEdges(traceT, "ff_A.T").length > 0, "Timing Trace T drives ff_A.T");

  const traceJk = await runSolver("timing-trace-mealy-jk-basic.json");
  validateDrivers(traceJk);
  assert.ok(incomingEdges(traceJk, "ff_A.J").length > 0, "Timing Trace JK drives ff_A.J");
  assert.ok(incomingEdges(traceJk, "ff_A.K").length > 0, "Timing Trace JK drives ff_A.K");

  const traceSr = await runSolver("timing-trace-mealy-sr-basic.json");
  validateDrivers(traceSr);
  assert.ok(incomingEdges(traceSr, "ff_A.S").length > 0, "Timing Trace SR drives ff_A.S");
  assert.ok(incomingEdges(traceSr, "ff_A.R").length > 0, "Timing Trace SR drives ff_A.R");
  assertNoSrOverlap(traceSr, "A");

  console.log("circuit topology tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
