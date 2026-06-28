const { spawn } = require("node:child_process");

const commands = [
  ["npm", ["run", "build"]],
  ["npm", ["run", "build:solver"]],
  ["npm", ["run", "test:solver", "--", "--json"]],
  ["node", ["server/test-state-aliases.cjs"]],
  ["npm", ["run", "test:normalize"]],
  ["npm", ["run", "test:input-config"]],
  ["npm", ["run", "test:kmap"]],
  ["npm", ["run", "test:circuit"]],
  ["node", ["server/test-api-smoke.cjs", "--spawn-server"]],
  ["npm", ["run", "test:browser"]],
  ["npm", ["run", "audit:dist"]],
  ["npm", ["run", "test:production"]],
];

function commandName(command, args) {
  return [command, ...args].join(" ");
}

function run(command, args) {
  return new Promise((resolve) => {
    let executable = command;
    let finalArgs = args;

    if (command === "npm" && process.env.npm_execpath) {
      executable = process.execPath;
      finalArgs = [process.env.npm_execpath, ...args];
    } else if (command === "node") {
      executable = process.execPath;
    } else if (process.platform === "win32" && command === "npm") {
      executable = "npm.cmd";
    }

    let child;
    try {
      child = spawn(executable, finalArgs, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
        windowsHide: true,
      });
    } catch (error) {
      process.stderr.write(`${commandName(command, args)} failed to start: ${error.message}\n`);
      resolve(1);
      return;
    }

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`${commandName(command, args)} failed to start: ${error.message}\n`);
      resolve(1);
    });
  });
}

async function main() {
  for (const [command, args] of commands) {
    process.stdout.write(`\n> ${commandName(command, args)}\n`);
    const code = await run(command, args);
    if (code !== 0) {
      process.stderr.write(`${commandName(command, args)} failed with exit code ${code}\n`);
      process.exit(code);
    }
  }
  process.stdout.write("\nverify:local completed\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
