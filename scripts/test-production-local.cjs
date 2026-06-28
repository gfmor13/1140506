const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const distDir = path.join(rootDir, "dist");
const solverPath = path.join(rootDir, "engine", process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver");

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "test-fixtures", "input-configs", name), "utf8"));
}

function fail(message) {
  process.stderr.write(`production local test failed: ${message}\n`);
  process.exit(1);
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < 12000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become healthy on port ${port}: ${lastError}`);
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`port ${port} is already in use`));
        return;
      }
      reject(error);
    });
    probe.once("listening", () => {
      probe.close(resolve);
    });
    probe.listen(port, "127.0.0.1");
  });
}

async function getText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  return { response, text };
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

async function main() {
  if (!fs.existsSync(distDir)) {
    fail("dist/ does not exist. Run npm run build first.");
  }
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    fail("dist/index.html does not exist.");
  }
  if (!fs.existsSync(solverPath)) {
    fail(`solver executable does not exist at ${path.relative(rootDir, solverPath)}.`);
  }
  await assertPortAvailable();

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      FSM_SOLVER_PATH: solverPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let serverOutput = "";
  let childClosed = false;
  const childClosedPromise = new Promise((resolve) => {
    child.once("close", (code) => {
      childClosed = true;
      resolve(code);
    });
  });
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForHealth();

    const health = await fetch(`${baseUrl}/api/health`);
    const healthJson = await health.json();
    if (!health.ok || healthJson.status !== "OK") {
      throw new Error("/api/health did not return { status: OK }.");
    }

    const stateTable = await postJson("/api/generate-circuit", readFixture("state-table-d-simplify-x.json"));
    if (!stateTable.response.ok || stateTable.json.status !== "OK") {
      throw new Error("State Table generate-circuit did not return OK.");
    }

    const timingTrace = await postJson("/api/generate-circuit", readFixture("timing-trace-mealy-d-basic.json"));
    if (!timingTrace.response.ok || timingTrace.json.status !== "OK") {
      throw new Error("Timing Trace generate-circuit did not return OK.");
    }

    const root = await getText("/");
    if (!root.response.ok || !root.text.includes('id="root"')) {
      throw new Error("frontend root did not return app HTML.");
    }

    const fallback = await getText("/some/non-api/path");
    if (!fallback.response.ok || !fallback.text.includes('id="root"')) {
      throw new Error("non-API route did not fallback to frontend HTML.");
    }

    const unknownApi = await getText("/api/unknown");
    const contentType = unknownApi.response.headers.get("content-type") || "";
    if (unknownApi.response.status !== 404 || !contentType.includes("application/json")) {
      throw new Error("/api/unknown did not return API JSON 404.");
    }
    const unknownJson = JSON.parse(unknownApi.text);
    if (unknownJson.status !== "ERROR") {
      throw new Error("/api/unknown JSON body did not report ERROR.");
    }

    process.stdout.write(
      JSON.stringify(
        {
          status: "OK",
          port,
          health: "OK",
          stateTable: "OK",
          timingTrace: "OK",
          frontendRoot: "OK",
          fallbackRoute: "OK",
          apiUnknownRoute: "OK",
          processCleanup: "OK",
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (!childClosed && !child.killed) {
      child.kill();
    }
    if (!childClosed) {
      await childClosedPromise;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
