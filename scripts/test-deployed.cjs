const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function fail(step, message) {
  process.stderr.write(`deployed smoke failed at ${step}: ${message}\n`);
  process.exit(1);
}

function normalizeBaseUrl(input) {
  if (!input) {
    fail("configuration", "missing URL. Use npm run test:deployed -- https://your-render-url.onrender.com or DEPLOY_URL=...");
  }
  try {
    const url = new URL(input);
    return url.toString().replace(/\/+$/, "");
  } catch (error) {
    fail("configuration", `invalid URL "${input}"`);
  }
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "test-fixtures", "input-configs", name), "utf8"));
}

async function getJson(baseUrl, pathname, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (response.status !== expectedStatus) {
    fail(`GET ${pathname}`, `expected HTTP ${expectedStatus}, got ${response.status}: ${text.slice(0, 160)}`);
  }
  try {
    return { response, json: JSON.parse(text), text };
  } catch (error) {
    fail(`GET ${pathname}`, `expected JSON response: ${error.message}`);
  }
}

async function getText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  return { response, text, contentType: response.headers.get("content-type") || "" };
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status !== 200) {
    fail(`POST ${pathname}`, `expected HTTP 200, got ${response.status}: ${text.slice(0, 160)}`);
  }
  try {
    return { response, json: JSON.parse(text) };
  } catch (error) {
    fail(`POST ${pathname}`, `expected JSON response: ${error.message}`);
  }
}

function assertResultSections(step, json) {
  if (json.status !== "OK") fail(step, `expected status OK, got ${json.status}`);
  if (!Array.isArray(json.equations) || json.equations.length === 0) fail(step, "missing equations");
  if (!Array.isArray(json.k_maps)) fail(step, "missing k_maps");
  if (!json.state_graph || typeof json.state_graph !== "object") fail(step, "missing state_graph");
  if (!json.timing_diagram || typeof json.timing_diagram !== "object") fail(step, "missing timing_diagram");
  if (!json.circuit_layout || typeof json.circuit_layout !== "object") fail(step, "missing circuit_layout");
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.DEPLOY_URL);

  const health = await getJson(baseUrl, "/api/health");
  if (health.json.status !== "OK") {
    fail("GET /api/health", `expected { status: OK }, got ${JSON.stringify(health.json)}`);
  }

  const stateTable = await postJson(baseUrl, "/api/generate-circuit", readFixture("state-table-d-simplify-x.json"));
  assertResultSections("POST State Table", stateTable.json);

  const timingTrace = await postJson(baseUrl, "/api/generate-circuit", readFixture("timing-trace-mealy-d-basic.json"));
  assertResultSections("POST Timing Trace", timingTrace.json);
  if (timingTrace.json.metadata?.input_mode !== "TIMING_TRACE") {
    fail("POST Timing Trace", `expected metadata.input_mode TIMING_TRACE, got ${timingTrace.json.metadata?.input_mode}`);
  }
  if (!timingTrace.json.debug?.inference_report) {
    fail("POST Timing Trace", "missing debug.inference_report");
  }

  const root = await getText(baseUrl, "/");
  if (root.response.status !== 200 || !/html/i.test(root.contentType) || !/id="root"|1140506 EDA/.test(root.text)) {
    fail("GET /", "expected frontend HTML with app root or product title");
  }

  const fallback = await getText(baseUrl, "/some/non-api/path");
  if (fallback.response.status !== 200 || !/html/i.test(fallback.contentType) || !/id="root"|1140506 EDA/.test(fallback.text)) {
    fail("GET /some/non-api/path", "expected frontend fallback HTML");
  }

  const unknownApi = await getText(baseUrl, "/api/unknown");
  if (/html/i.test(unknownApi.contentType) || /id="root"|<!doctype html/i.test(unknownApi.text)) {
    fail("GET /api/unknown", "API unknown route returned frontend HTML");
  }
  if (unknownApi.response.status < 400 || unknownApi.response.status >= 500) {
    fail("GET /api/unknown", `expected API 4xx response, got HTTP ${unknownApi.response.status}`);
  }
  try {
    const body = JSON.parse(unknownApi.text);
    if (body.status !== "ERROR") {
      fail("GET /api/unknown", "expected API JSON error body");
    }
  } catch (error) {
    fail("GET /api/unknown", `expected JSON error body: ${error.message}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        status: "OK",
        baseUrl,
        health: "OK",
        stateTable: "OK",
        timingTrace: "OK",
        frontendRoot: "OK",
        fallbackRoute: "OK",
        apiUnknownRoute: "OK",
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((error) => {
  fail("unexpected", error.stack || error.message);
});
