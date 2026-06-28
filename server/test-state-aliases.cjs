const assert = require("node:assert/strict");

async function main() {
  const aliases = await import("../src/lib/stateAliases.js");
  const validation = await import("./inputConfigValidation.js");

  const { canonicalizeStateId } = aliases;
  const { validateInputConfig } = validation;

  assert.equal(canonicalizeStateId("A", 30), "S0", "A -> S0");
  assert.equal(canonicalizeStateId("B", 30), "S1", "B -> S1");
  assert.equal(canonicalizeStateId("Z", 30), "S25", "Z -> S25");
  assert.equal(canonicalizeStateId("AA", 30), "S26", "AA -> S26");
  assert.equal(canonicalizeStateId("AB", 30), "S27", "AB -> S27");
  assert.equal(canonicalizeStateId("a", 30), "S0", "lowercase a -> S0");
  assert.equal(canonicalizeStateId("s0", 30), "S0", "lowercase s0 -> S0");
  assert.equal(canonicalizeStateId("AD", 30), "S29", "state_count=30 AD valid");

  assert.throws(() => canonicalizeStateId("AE", 30), /out of range/i, "AE invalid");
  assert.throws(() => canonicalizeStateId("S30", 30), /out of range/i, "S30 invalid");

  const normalized = validateInputConfig({
    input_mode: "STATE_TABLE",
    state_count: 8,
    input_count: 1,
    output_count: 1,
    states: ["A", "H"],
    inputs: ["X"],
    outputs: ["Y"],
    transitions: [
      {
        present_state: "a",
        input: "0",
        next_state: "H",
        output: "1",
      },
    ],
  });

  assert.deepEqual(normalized.states, ["S0", "S7"]);
  assert.equal(normalized.transitions[0].present_state, "S0");
  assert.equal(normalized.transitions[0].next_state, "S7");

  console.log("state alias tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
