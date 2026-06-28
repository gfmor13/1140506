const assert = require("node:assert/strict");

async function main() {
  const normalizeModule = await import("../src/lib/normalizeFsmResult.js");
  const testModule = await import("../src/lib/normalizeFsmResult.test.js");

  const cases = testModule.normalizeTestCases(normalizeModule);
  for (const testCase of cases) {
    testCase.run(assert);
  }

  console.log(`normalize tests passed: ${cases.length}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
