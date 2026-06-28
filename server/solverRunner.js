import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { getSolverSpawnEnv } = require("../engine/solverRuntimeEnv.cjs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const DEFAULT_TIMEOUT_MS = 10000;

function defaultSolverPath() {
  const executable = process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver";
  return path.join(rootDir, "engine", executable);
}

function resolveSolverPath() {
  if (process.env.FSM_SOLVER_PATH) {
    return path.isAbsolute(process.env.FSM_SOLVER_PATH)
      ? process.env.FSM_SOLVER_PATH
      : path.resolve(rootDir, process.env.FSM_SOLVER_PATH);
  }
  return defaultSolverPath();
}

export function getResolvedSolverPath() {
  return resolveSolverPath();
}

export function runSolver(inputConfig, options = {}) {
  const solverPath = resolveSolverPath();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(solverPath, [], {
      cwd: rootDir,
      env: getSolverSpawnEnv(process.env),
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      const error = new Error(`solver timed out after ${timeoutMs}ms`);
      error.stderr = stderr;
      reject(error);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      error.stderr = stderr;
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const engineTimeMs = Date.now() - startedAt;

      if (code !== 0) {
        const error = new Error(`solver exited with code ${code}`);
        error.stderr = stderr;
        reject(error);
        return;
      }

      try {
        const json = JSON.parse(stdout);
        resolve({ json, engineTimeMs, stderr, solverPath });
      } catch (error) {
        error.message = `solver returned invalid JSON: ${error.message}`;
        error.stderr = stderr;
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(inputConfig));
  });
}
