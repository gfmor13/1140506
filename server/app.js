import crypto from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateInputConfig } from "./inputConfigValidation.js";
import { runSolver } from "./solverRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexHtml = path.join(distDir, "index.html");

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "OK" });
  });

  app.post("/api/generate-circuit", async (request, response) => {
    const requestId = crypto.randomUUID();
    const latencyStartedAt = Date.now();
    response.setHeader("X-Request-Id", requestId);

    try {
      const inputConfig = validateInputConfig(request.body);
      const { json, engineTimeMs, stderr } = await runSolver(inputConfig);
      const engineLatencyMs = Date.now() - latencyStartedAt;

      response.setHeader("X-Engine-Time-Ms", String(engineTimeMs));
      response.setHeader("X-Engine-Latency-Ms", String(engineLatencyMs));

      const debug = json.debug && typeof json.debug === "object" ? json.debug : {};
      if (stderr) {
        debug.solver_stderr = stderr;
      }

      response.json({
        ...json,
        debug,
        api_validation: {
          request_id: requestId,
          accepted: true,
          normalized_config: inputConfig,
        },
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      response.setHeader("X-Engine-Time-Ms", "0");
      response.setHeader("X-Engine-Latency-Ms", String(Date.now() - latencyStartedAt));
      response.status(statusCode).json({
        status: "ERROR",
        message: error.message,
        api_validation: {
          request_id: requestId,
          accepted: false,
        },
        debug: {
          stderr: error.stderr || "",
        },
      });
    }
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ status: "ERROR", message: "API route not found" });
  });

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(distDir));
    app.get("*", (_request, response) => {
      if (fs.existsSync(indexHtml)) {
        response.sendFile(indexHtml);
        return;
      }
      response.status(404).send("Frontend build not found");
    });
  }

  return app;
}
