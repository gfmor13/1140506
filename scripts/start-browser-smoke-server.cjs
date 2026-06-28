const { spawn } = require("node:child_process");

const child = spawn(process.execPath, ["server/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "4173",
  },
  stdio: "inherit",
  windowsHide: true,
});

function stop() {
  child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
