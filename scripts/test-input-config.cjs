const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function readFixture(...parts) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "test-fixtures", ...parts), "utf8"));
}

async function main() {
  const builder = await import("../src/lib/inputConfigBuilder.js");
  const {
    buildStateTableInputConfig,
    buildTimingTraceInputConfig,
    classifyImportJson,
    parseTimingTraceValues,
    validateInputConfigLocal,
  } = builder;

  const mealyFixture = readFixture("input-configs", "state-table-mealy-d-basic.json");
  const mealyToggleFixture = readFixture("input-configs", "state-table-mealy-d-toggle.json");
  const mooreFixture = readFixture("input-configs", "state-table-moore-d-basic.json");
  const mooreOutputFixture = readFixture("input-configs", "state-table-moore-d-output-by-state.json");
  const threeStateFixture = readFixture("input-configs", "state-table-d-3state.json");
  const missingTransitionFixture = readFixture("input-configs", "state-table-invalid-missing-transition.json");
  const invalidMooreFixture = readFixture("input-configs", "state-table-invalid-moore-output.json");
  const tooManyStatesFixture = readFixture("input-configs", "state-table-invalid-too-many-states-phase3b.json");
  const tToggleFixture = readFixture("input-configs", "state-table-t-toggle-by-x.json");
  const tMooreFixture = readFixture("input-configs", "state-table-t-moore-output-by-state.json");
  const tMissingTransitionFixture = readFixture("input-configs", "state-table-t-invalid-missing-transition.json");
  const tInvalidMooreFixture = readFixture("input-configs", "state-table-t-invalid-moore-output.json");
  const jkToggleFixture = readFixture("input-configs", "state-table-jk-toggle-by-x.json");
  const jkMooreFixture = readFixture("input-configs", "state-table-jk-moore-output-by-state.json");
  const jkMissingTransitionFixture = readFixture("input-configs", "state-table-jk-invalid-missing-transition.json");
  const jkInvalidMooreFixture = readFixture("input-configs", "state-table-jk-invalid-moore-output.json");
  const srToggleFixture = readFixture("input-configs", "state-table-sr-toggle-by-x.json");
  const srMooreFixture = readFixture("input-configs", "state-table-sr-moore-output-by-state.json");
  const srMissingTransitionFixture = readFixture("input-configs", "state-table-sr-invalid-missing-transition.json");
  const srInvalidMooreFixture = readFixture("input-configs", "state-table-sr-invalid-moore-output.json");
  const timingFixture = readFixture("input-configs", "timing-trace-basic.json");
  const traceD = readFixture("input-configs", "timing-trace-mealy-d-basic.json");
  const traceT = readFixture("input-configs", "timing-trace-mealy-t-basic.json");
  const traceJk = readFixture("input-configs", "timing-trace-mealy-jk-basic.json");
  const traceSr = readFixture("input-configs", "timing-trace-mealy-sr-basic.json");
  const traceMooreD = readFixture("input-configs", "timing-trace-moore-d-basic.json");
  const traceLengthMismatch = readFixture("input-configs", "timing-trace-invalid-length-mismatch.json");
  const traceNonbinary = readFixture("input-configs", "timing-trace-invalid-nonbinary.json");
  const traceTooShort = readFixture("input-configs", "timing-trace-invalid-too-short.json");
  const resultFixture = readFixture("solver-results", "minimal-result-y-xqb.json");

  assert.equal(validateInputConfigLocal(mealyFixture).ok, true, "Mealy fixture validation");
  assert.equal(validateInputConfigLocal(mealyToggleFixture).ok, true, "Mealy D toggle fixture validation");
  assert.equal(validateInputConfigLocal(mooreFixture).ok, true, "Moore fixture validation");
  assert.equal(validateInputConfigLocal(mooreOutputFixture).ok, true, "Moore output fixture validation");
  assert.equal(validateInputConfigLocal(threeStateFixture).ok, true, "3-state fixture validation");
  assert.equal(validateInputConfigLocal(tToggleFixture).ok, true, "T toggle-by-X fixture validation");
  assert.equal(validateInputConfigLocal(tMooreFixture).ok, true, "T Moore fixture validation");
  assert.equal(validateInputConfigLocal(jkToggleFixture).ok, true, "JK toggle-by-X fixture validation");
  assert.equal(validateInputConfigLocal(jkMooreFixture).ok, true, "JK Moore fixture validation");
  assert.equal(validateInputConfigLocal(srToggleFixture).ok, true, "SR toggle-by-X fixture validation");
  assert.equal(validateInputConfigLocal(srMooreFixture).ok, true, "SR Moore fixture validation");
  assert.equal(validateInputConfigLocal(timingFixture).ok, true, "Timing fixture validation");
  assert.equal(validateInputConfigLocal(traceD).ok, true, "Timing Trace D fixture validation");
  assert.equal(validateInputConfigLocal(traceT).ok, true, "Timing Trace T fixture validation");
  assert.equal(validateInputConfigLocal(traceJk).ok, true, "Timing Trace JK fixture validation");
  assert.equal(validateInputConfigLocal(traceSr).ok, true, "Timing Trace SR fixture validation");
  assert.equal(validateInputConfigLocal(traceMooreD).ok, true, "Timing Trace Moore D fixture validation");

  assert.equal(
    validateInputConfigLocal({ ...mealyFixture, state_count: 0 }).ok,
    false,
    "invalid state_count fails",
  );
  assert.equal(
    validateInputConfigLocal({
      ...mealyFixture,
      transitions: [{ ...mealyFixture.transitions[0], output: "2" }],
    }).ok,
    false,
    "invalid output bit width fails",
  );
  assert.equal(
    validateInputConfigLocal({
      ...timingFixture,
      timing_trace: { X: ["0", "1"], Z: ["0", "1", "0"] },
    }).ok,
    false,
    "timing trace length mismatch fails",
  );
  assert.equal(validateInputConfigLocal(traceLengthMismatch).ok, false, "Timing Trace fixture length mismatch fails");
  assert.equal(validateInputConfigLocal(traceNonbinary).ok, false, "Timing Trace fixture nonbinary fails");
  assert.equal(validateInputConfigLocal(traceTooShort).ok, false, "Timing Trace fixture too short fails");
  assert.equal(
    validateInputConfigLocal(missingTransitionFixture).ok,
    false,
    "missing state transition fails",
  );
  assert.equal(
    validateInputConfigLocal({
      ...mealyToggleFixture,
      transitions: [...mealyToggleFixture.transitions, { ...mealyToggleFixture.transitions[0] }],
    }).ok,
    false,
    "duplicate state transition fails",
  );
  assert.equal(
    validateInputConfigLocal(invalidMooreFixture).ok,
    false,
    "Moore output inconsistency fails",
  );
  assert.equal(
    validateInputConfigLocal(tMissingTransitionFixture).ok,
    false,
    "T missing state transition fails",
  );
  assert.equal(
    validateInputConfigLocal(tInvalidMooreFixture).ok,
    false,
    "T Moore output inconsistency fails",
  );
  assert.equal(
    validateInputConfigLocal(jkMissingTransitionFixture).ok,
    false,
    "JK missing state transition fails",
  );
  assert.equal(
    validateInputConfigLocal(jkInvalidMooreFixture).ok,
    false,
    "JK Moore output inconsistency fails",
  );
  assert.equal(
    validateInputConfigLocal(srMissingTransitionFixture).ok,
    false,
    "SR missing state transition fails",
  );
  assert.equal(
    validateInputConfigLocal(srInvalidMooreFixture).ok,
    false,
    "SR Moore output inconsistency fails",
  );
  assert.equal(
    validateInputConfigLocal(tooManyStatesFixture).ok,
    false,
    "Phase 4A too many states fails",
  );
  assert.match(
    validateInputConfigLocal(tooManyStatesFixture).errors.join("\n"),
    /Phase 4A supports up to 8 states/i,
  );

  const mealyConfig = buildStateTableInputConfig({
    fsmModel: "Mealy",
    ffType: "D",
    stateCount: 2,
    inputCount: 1,
    outputCount: 1,
    rows: [
      { presentState: "A", nextState0: "A", output0: "0", nextState1: "B", output1: "1" },
      { presentState: "B", nextState0: "A", output0: "0", nextState1: "B", output1: "1" },
    ],
  });
  assert.deepEqual(mealyConfig, { ...mealyFixture, outputs: ["Z"] });

  const mooreConfig = buildStateTableInputConfig({
    fsmModel: "Moore",
    ffType: "D",
    stateCount: 2,
    inputCount: 1,
    outputCount: 1,
    rows: [
      { presentState: "A", nextState0: "A", nextState1: "B", output: "0" },
      { presentState: "B", nextState0: "A", nextState1: "B", output: "1" },
    ],
  });
  assert.deepEqual(mooreConfig, { ...mooreFixture, outputs: ["Z"] });

  for (const text of ["0 1 1 0", "0110", "0.1.1.0", "0,1,1,0", "0|1|1|0", "0_1\n1_0"]) {
    assert.deepEqual(parseTimingTraceValues(text), ["0", "1", "1", "0"]);
  }
  assert.throws(() => parseTimingTraceValues("0 1 2 0"), /non-binary/i);

  const timingConfig = buildTimingTraceInputConfig({
    fsmModel: "Mealy",
    ffType: "D",
    stateCount: 2,
    xTrace: "0,1,1,0",
    zTrace: "0|1|0|1",
  });
  assert.deepEqual(timingConfig, timingFixture);

  assert.equal(classifyImportJson(resultFixture), "FSM_RESULT", "Import FSM_Result fixture detection");
  assert.equal(classifyImportJson(mealyFixture), "INPUT_CONFIG", "Import InputConfig fixture detection");
  assert.equal(classifyImportJson(tToggleFixture), "INPUT_CONFIG", "Import T InputConfig fixture detection");
  assert.equal(classifyImportJson(jkToggleFixture), "INPUT_CONFIG", "Import JK InputConfig fixture detection");
  assert.equal(classifyImportJson(srToggleFixture), "INPUT_CONFIG", "Import SR InputConfig fixture detection");
  assert.equal(classifyImportJson(traceD), "INPUT_CONFIG", "Import Timing Trace InputConfig fixture detection");
  assert.equal(classifyImportJson({ hello: "world" }), "UNKNOWN");

  console.log("input config tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
