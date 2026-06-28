const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const spawnServer = process.argv.includes("--spawn-server");
const BASE_URL = process.env.API_SMOKE_BASE_URL || (spawnServer ? "http://127.0.0.1:4181" : "http://127.0.0.1:3001");
const dFixtureName = "state-table-d-simplify-x.json";
const tFixtureName = "state-table-t-toggle-by-x.json";
const jkFixtureName = "state-table-jk-toggle-by-x.json";
const srFixtureName = "state-table-sr-toggle-by-x.json";
const timingTraceFixtureName = "timing-trace-mealy-d-basic.json";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`server did not become ready: ${lastError?.message || "timeout"}`);
}

function requireHeader(response, name) {
  const value = response.headers.get(name);
  if (!value) {
    throw new Error(`missing response header ${name}`);
  }
  return value;
}

function hasEquation(json, target) {
  return (json.equations ?? []).some((item) => item?.target === target || item?.name === target);
}

function getEquation(json, target) {
  return (json.equations ?? []).find((item) => item?.target === target || item?.name === target);
}

function hasCoreSections(json) {
  for (const key of ["equations", "k_maps", "state_graph", "timing_diagram", "circuit_layout"]) {
    if (!json[key]) {
      throw new Error(`missing ${key}`);
    }
  }
}

function assertRawComplementContract(json) {
  const rawText = JSON.stringify(json);
  if (rawText.includes("#") && rawText.includes("Qb'")) {
    throw new Error("raw solver JSON mixed # complement with UI apostrophe display");
  }
}

function assertGroupsAvoidZero(json) {
  for (const map of json.k_maps ?? []) {
    const cells = new Map((map.cells ?? []).map((cell) => [cell.id ?? cell.minterm, cell]));
    for (const group of map.groups ?? []) {
      for (const cellId of group.cells ?? []) {
        if (String(cells.get(cellId)?.value) === "0") {
          throw new Error(`group ${group.id} includes 0 cell ${cellId}`);
        }
      }
    }
  }
}

function assertTargetDrivers(json) {
  for (const node of json.circuit_layout?.nodes ?? []) {
    const type = String(node.type ?? "").toUpperCase();
    if (type === "OUTPUT_PIN") {
      const hasDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.IN`);
      if (!hasDriver) throw new Error(`${node.id}.IN has no driver`);
    }
    if (type === "D_FF") {
      const hasDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.D`);
      if (!hasDriver) throw new Error(`${node.id}.D has no driver`);
    }
    if (type === "T_FF") {
      const hasDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.T`);
      if (!hasDriver) throw new Error(`${node.id}.T has no driver`);
    }
    if (type === "JK_FF") {
      const hasJDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.J`);
      const hasKDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.K`);
      if (!hasJDriver) throw new Error(`${node.id}.J has no driver`);
      if (!hasKDriver) throw new Error(`${node.id}.K has no driver`);
    }
    if (type === "SR_FF") {
      const hasSDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.S`);
      const hasRDriver = (json.circuit_layout?.edges ?? []).some((edge) => edge.to === `${node.id}.R`);
      if (!hasSDriver) throw new Error(`${node.id}.S has no driver`);
      if (!hasRDriver) throw new Error(`${node.id}.R has no driver`);
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
      if (!variable) return false;
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
  if (!sEquation || !rEquation) throw new Error(`missing S/R equations for ${suffix}`);
  const stateCount = Number(json.metadata?.state_count ?? 0);
  for (const row of sEquation.truth_table ?? []) {
    const stateBits = (sEquation.variables ?? []).filter((variable) => String(variable).startsWith("Q_"));
    const presentBits = stateBits.map((variable) => String(row[variable] ?? "0")).join("");
    const presentIndex = Number.parseInt(presentBits || "0", 2);
    if (presentIndex >= stateCount) continue;
    const s = evaluateExpression(sEquation.expression, row, sEquation.variables);
    const r = evaluateExpression(rEquation.expression, row, rEquation.variables);
    if (s && r) throw new Error(`SR illegal overlap for ${suffix} at ${JSON.stringify(row)}`);
  }
}

function signalValues(json, name) {
  return (json.timing_diagram?.signals ?? []).find((signal) => signal.name === name)?.values ?? [];
}

async function postFixtureRaw(fixtureName) {
  const fixturePath = path.resolve(process.cwd(), "test-fixtures", "input-configs", fixtureName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const response = await fetch(`${BASE_URL}/api/generate-circuit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fixture),
  });
  const requestId = requireHeader(response, "X-Request-Id");
  const engineTimeMs = requireHeader(response, "X-Engine-Time-Ms");
  const json = await response.json();
  return { fixture, response, json, requestId, engineTimeMs };
}

async function postFixture(fixtureName) {
  const { response, json, requestId, engineTimeMs } = await postFixtureRaw(fixtureName);
  if (response.status !== 200) {
    throw new Error(`${fixtureName} POST /api/generate-circuit returned HTTP ${response.status}`);
  }
  if (json.status !== "OK") {
    throw new Error(`${fixtureName} solver status was not OK`);
  }
  if (!json.api_validation) {
    throw new Error(`${fixtureName} missing api_validation`);
  }
  hasCoreSections(json);
  assertGroupsAvoidZero(json);
  assertTargetDrivers(json);
  assertRawComplementContract(json);
  return { json, requestId, engineTimeMs };
}

async function main() {
  let child;
  let stoppingChild = false;
  if (spawnServer) {
    child = spawn(process.execPath, ["server/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: new URL(BASE_URL).port || "4181" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    child.on("exit", (code) => {
      if (!stoppingChild && code !== null && code !== 0 && !process.exitCode) {
        process.exitCode = 1;
      }
    });
    await waitForServer(BASE_URL);
  }

  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    if (health.status !== 200) {
      throw new Error(`GET /api/health returned HTTP ${health.status}`);
    }
    const healthJson = await health.json();
    if (healthJson.status !== "OK") {
      throw new Error("GET /api/health did not return status OK");
    }

    const dSmoke = await postFixture(dFixtureName);
    const dJson = dSmoke.json;
    if (!hasEquation(dJson, "D_A")) {
      throw new Error("missing D_A equation");
    }
    if (!hasEquation(dJson, "Y")) {
      throw new Error("missing Y equation");
    }
    if (getEquation(dJson, "D_A")?.expression !== "X") {
      throw new Error("D_A equation was not simplified to X");
    }

    const tSmoke = await postFixture(tFixtureName);
    const tJson = tSmoke.json;
    if (!hasEquation(tJson, "T_A")) {
      throw new Error("missing T_A equation");
    }
    if (getEquation(tJson, "T_A")?.expression !== "X") {
      throw new Error("T_A equation was not simplified to X");
    }
    if (!(tJson.circuit_layout?.nodes ?? []).some((node) => String(node.type).toUpperCase() === "T_FF")) {
      throw new Error("missing T_FF circuit node");
    }
    if (!(tJson.circuit_layout?.edges ?? []).some((edge) => edge.to === "ff_A.T")) {
      throw new Error("ff_A.T has no driver");
    }

    const jkSmoke = await postFixture(jkFixtureName);
    const jkJson = jkSmoke.json;
    if (!hasEquation(jkJson, "J_A") || !hasEquation(jkJson, "K_A")) {
      throw new Error("missing J_A or K_A equation");
    }
    if (getEquation(jkJson, "J_A")?.expression !== "X") {
      throw new Error("J_A equation was not simplified to X");
    }
    if (getEquation(jkJson, "K_A")?.expression !== "X") {
      throw new Error("K_A equation was not simplified to X");
    }
    if (!(jkJson.circuit_layout?.nodes ?? []).some((node) => String(node.type).toUpperCase() === "JK_FF")) {
      throw new Error("missing JK_FF circuit node");
    }
    if (!(jkJson.circuit_layout?.edges ?? []).some((edge) => edge.to === "ff_A.J")) {
      throw new Error("ff_A.J has no driver");
    }
    if (!(jkJson.circuit_layout?.edges ?? []).some((edge) => edge.to === "ff_A.K")) {
      throw new Error("ff_A.K has no driver");
    }

    const srSmoke = await postFixture(srFixtureName);
    const srJson = srSmoke.json;
    if (!hasEquation(srJson, "S_A") || !hasEquation(srJson, "R_A")) {
      throw new Error("missing S_A or R_A equation");
    }
    assertNoSrOverlap(srJson, "A");
    if (!(srJson.circuit_layout?.nodes ?? []).some((node) => String(node.type).toUpperCase() === "SR_FF")) {
      throw new Error("missing SR_FF circuit node");
    }
    if (!(srJson.circuit_layout?.edges ?? []).some((edge) => edge.to === "ff_A.S")) {
      throw new Error("ff_A.S has no driver");
    }
    if (!(srJson.circuit_layout?.edges ?? []).some((edge) => edge.to === "ff_A.R")) {
      throw new Error("ff_A.R has no driver");
    }

    const traceSmoke = await postFixture(timingTraceFixtureName);
    const traceJson = traceSmoke.json;
    const traceFixture = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "test-fixtures", "input-configs", timingTraceFixtureName), "utf8"),
    );
    if (traceJson.metadata?.input_mode !== "TIMING_TRACE") {
      throw new Error("Timing Trace smoke missing metadata.input_mode TIMING_TRACE");
    }
    if (!traceJson.metadata?.inference?.strategy) {
      throw new Error("Timing Trace smoke missing inference strategy");
    }
    if (traceJson.metadata.inference.trace_length !== traceFixture.timing_trace.X.length) {
      throw new Error("Timing Trace smoke trace_length mismatch");
    }
    if (!traceJson.debug?.inference_report) {
      throw new Error("Timing Trace smoke missing debug.inference_report");
    }
    if (!Array.isArray(traceJson.debug.inference_report.steps) || traceJson.debug.inference_report.steps.length === 0) {
      throw new Error("Timing Trace smoke missing inference report steps");
    }
    if (traceJson.timing_diagram?.source !== "timing_trace_input") {
      throw new Error("Timing Trace smoke timing_diagram source mismatch");
    }
    if (JSON.stringify(signalValues(traceJson, "X")) !== JSON.stringify(traceFixture.timing_trace.X)) {
      throw new Error("Timing Trace X signal did not match fixture");
    }
    if (JSON.stringify(signalValues(traceJson, "Z")) !== JSON.stringify(traceFixture.timing_trace.Z)) {
      throw new Error("Timing Trace Z signal did not match fixture");
    }

    const invalidTraceSmoke = await postFixtureRaw("timing-trace-invalid-length-mismatch.json");
    if (invalidTraceSmoke.response.status < 400) {
      throw new Error("invalid Timing Trace length mismatch did not return HTTP error");
    }
    if (invalidTraceSmoke.json.status !== "ERROR") {
      throw new Error("invalid Timing Trace length mismatch did not return status ERROR");
    }
    if (!/length mismatch/i.test(invalidTraceSmoke.json.message ?? "")) {
      throw new Error("invalid Timing Trace length mismatch message missing");
    }

    process.stdout.write(
      JSON.stringify(
        {
          status: "OK",
          health: healthJson.status,
          generateCircuit: dJson.status,
          fixtures: [dFixtureName, tFixtureName, jkFixtureName, srFixtureName, timingTraceFixtureName],
          requestId: dSmoke.requestId,
          engineTimeMs: dSmoke.engineTimeMs,
          tRequestId: tSmoke.requestId,
          tEngineTimeMs: tSmoke.engineTimeMs,
          jkRequestId: jkSmoke.requestId,
          jkEngineTimeMs: jkSmoke.engineTimeMs,
          srRequestId: srSmoke.requestId,
          srEngineTimeMs: srSmoke.engineTimeMs,
          timingTraceRequestId: traceSmoke.requestId,
          timingTraceEngineTimeMs: traceSmoke.engineTimeMs,
          equations: dJson.equations.map((equation) => equation.target ?? equation.name),
          tEquations: tJson.equations.map((equation) => equation.target ?? equation.name),
          jkEquations: jkJson.equations.map((equation) => equation.target ?? equation.name),
          srEquations: srJson.equations.map((equation) => equation.target ?? equation.name),
          timingTraceInference: traceJson.metadata.inference.strategy,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (child) {
      stoppingChild = true;
      child.kill();
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
