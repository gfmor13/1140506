const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const imageDir = path.join(rootDir, "docs", "images");
const port = 4176;
const baseUrl = `http://127.0.0.1:${port}`;
const solverPath = path.join(rootDir, "engine", process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver");

function ensureRuntimeFiles() {
  if (!fs.existsSync(path.join(rootDir, "dist", "index.html"))) {
    throw new Error("dist/index.html is missing. Run npm run build first.");
  }
  if (!fs.existsSync(solverPath)) {
    throw new Error(`solver executable is missing at ${path.relative(rootDir, solverPath)}. Run npm run build:solver first.`);
  }
  fs.mkdirSync(imageDir, { recursive: true });
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < 12000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`screenshot server did not become healthy: ${lastError}`);
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

async function save(page, name) {
  const outputPath = path.join(imageDir, name);
  await page.screenshot({ path: outputPath, fullPage: false });
  return path.relative(rootDir, outputPath);
}

async function compileStateTable(page) {
  await page.getByTestId("mode-state-table").click();
  await page.getByLabel("FF Type").selectOption("D");
  await page.getByTestId("compile-button").click();
  await page.waitForFunction(() => /success|OK/i.test(document.querySelector('[data-testid="inspector-panel"]')?.textContent || ""), null, {
    timeout: 10000,
  });
}

async function captureArchitecture(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            width: 1440px;
            height: 900px;
            background: #050816;
            color: #e5e7eb;
            font-family: Inter, Segoe UI, Arial, sans-serif;
          }
          .wrap { padding: 72px; }
          h1 { margin: 0 0 18px; color: #2dd4bf; font-size: 42px; }
          p { margin: 0 0 46px; color: #94a3b8; font-size: 20px; }
          .flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 24px; align-items: center; }
          .box {
            min-height: 156px;
            border: 1px solid rgba(45, 212, 191, 0.45);
            background: #0b1120;
            box-shadow: 0 0 32px rgba(45, 212, 191, 0.08);
            padding: 24px;
          }
          .label { color: #38bdf8; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; }
          .title { margin-top: 18px; font-size: 28px; font-weight: 800; }
          .desc { margin-top: 12px; color: #94a3b8; font-size: 16px; line-height: 1.5; }
          .arrow { color: #8b5cf6; font-size: 48px; text-align: center; }
          .grid { margin-top: 58px; border-top: 1px solid rgba(148, 163, 184, .18); padding-top: 28px; color: #94a3b8; font-family: Consolas, monospace; font-size: 18px; line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>1140506 EDA System Architecture</h1>
          <p>Render Docker Web Service with stateless Express API and C++ FSM solver over stdin/stdout.</p>
          <div class="flow">
            <div class="box"><div class="label">Frontend</div><div class="title">React Workbench</div><div class="desc">Input Builder and result views.</div></div>
            <div class="arrow">→</div>
            <div class="box"><div class="label">API</div><div class="title">Express</div><div class="desc">POST /api/generate-circuit validates and spawns solver.</div></div>
            <div class="arrow">→</div>
            <div class="box"><div class="label">Engine</div><div class="title">C++ Solver</div><div class="desc">Returns FSM_Result JSON for equations, K-Maps, diagrams, and circuits.</div></div>
          </div>
          <div class="grid">React Frontend → Node Express API → C++ Solver stdin/stdout → FSM_Result JSON → Normalized ViewModel → EDA result views</div>
        </div>
      </body>
    </html>`);
  const saved = await save(page, "system-architecture.png");
  await page.close();
  return saved;
}

async function main() {
  ensureRuntimeFiles();
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
  let childClosed = false;
  const childClosedPromise = new Promise((resolve) => {
    child.once("close", (code) => {
      childClosed = true;
      resolve(code);
    });
  });

  let browser;
  const saved = [];
  try {
    await waitForHealth();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    saved.push(await save(page, "homepage.png"));

    await page.getByTestId("mode-state-table").click();
    saved.push(await save(page, "state-table-input.png"));

    await page.getByTestId("mode-timing-trace").click();
    await page.getByLabel("X input").fill("0110");
    await page.getByLabel("Z output").fill("0101");
    saved.push(await save(page, "timing-trace-input.png"));

    await compileStateTable(page);
    await page.getByTestId("tab-ff-equations").click();
    saved.push(await save(page, "ff-equations.png"));

    await page.getByTestId("tab-k-map").click();
    saved.push(await save(page, "kmap-view.png"));

    await page.getByTestId("tab-state-diagram").click();
    saved.push(await save(page, "state-diagram.png"));

    await page.getByTestId("tab-circuit-diagram").click();
    saved.push(await save(page, "circuit-diagram.png"));

    await page.getByTestId("tab-timing-diagram").click();
    saved.push(await save(page, "timing-diagram.png"));

    await page.getByTestId("mode-timing-trace").click();
    await page.getByLabel("X input").fill("0951224");
    await page.getByTestId("debug-panel").waitFor({ timeout: 10000 });
    saved.push(await save(page, "debug-monitor.png"));

    saved.push(await captureArchitecture(browser));
    await page.close();

    process.stdout.write(
      JSON.stringify(
        {
          status: "OK",
          screenshots: saved,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!childClosed && !child.killed) {
      child.kill();
    }
    if (!childClosed) {
      await childClosedPromise;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`screenshots failed: ${error.message}\n`);
  process.exit(1);
});
