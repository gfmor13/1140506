const { spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join("engine", "fsm_solver.cpp");
const outputPath = path.join(
  "engine",
  process.platform === "win32" ? "fsm_solver.exe" : "fsm_solver",
);

function compilerCommand() {
  if (process.env.CXX) return process.env.CXX;
  if (process.platform === "win32") {
    const commonGcc = "C:\\msys64\\ucrt64\\bin\\g++.exe";
    try {
      require("node:fs").accessSync(commonGcc);
      return commonGcc;
    } catch {
      return "g++";
    }
  }
  return "g++";
}

function buildEnv() {
  const env = { ...process.env };
  if (process.platform === "win32") {
    const msysTmp = "C:\\msys64\\tmp";
    const currentPath = env.PATH || env.Path || "";
    env.TMP = env.TMP && /^[\x00-\x7F]+$/.test(env.TMP) ? env.TMP : msysTmp;
    env.TEMP = env.TEMP && /^[\x00-\x7F]+$/.test(env.TEMP) ? env.TEMP : msysTmp;
    env.PATH = [currentPath, "C:\\msys64\\ucrt64\\bin", "C:\\msys64\\usr\\bin"]
      .filter(Boolean)
      .join(";");
    env.Path = env.PATH;
  }
  return env;
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: rootDir,
    env: buildEnv(),
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
}

const compiler = compilerCommand();
const version = run(compiler, ["--version"]);
if (version.error) {
  process.stderr.write(
    "g++ was not found. Install a C++ compiler before building engine/fsm_solver.cpp.\n",
  );
  process.stderr.write(`${version.error.message}\n`);
  process.exit(1);
}

const args = ["-std=c++17", "-O2"];
if (process.platform === "win32") {
  args.push("-static-libgcc", "-static-libstdc++");
}
args.push(sourcePath, "-o", outputPath);
const result = run(compiler, args);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "g++ failed without output\n");
  process.exit(result.status || 1);
}

process.stdout.write(`Built ${outputPath}\n`);
