export const TEACHER_STANDARD_ROWS = [
  { presentState: "A", nextState0: "A", output0: "0", nextState1: "B", output1: "0" },
  { presentState: "B", nextState0: "C", output0: "1", nextState1: "A", output1: "0" },
  { presentState: "C", nextState0: "A", output0: "1", nextState1: "C", output1: "1" },
];

export const TEACHER_STANDARD_TRANSITIONS = [
  { present_state: "S0", input: "0", next_state: "S0", output: "0" },
  { present_state: "S0", input: "1", next_state: "S1", output: "0" },
  { present_state: "S1", input: "0", next_state: "S2", output: "1" },
  { present_state: "S1", input: "1", next_state: "S0", output: "0" },
  { present_state: "S2", input: "0", next_state: "S0", output: "1" },
  { present_state: "S2", input: "1", next_state: "S2", output: "1" },
];

export const TEACHER_STANDARD_EQUATIONS = {
  J1: "Q0·X'",
  K1: "X'",
  J0: "Q1'·X",
  K0: "1",
  Z: "Q1 + Q0·X'",
};

export const TEACHER_STANDARD_EQUATION_ITEMS = Object.entries(TEACHER_STANDARD_EQUATIONS).map(
  ([id, expression]) => ({ id, expression, label: `${id} = ${expression}` }),
);

export const TEACHER_STANDARD_FF_INPUT_ROWS = [
  { flipFlop: "FF for Q1", input: "J1", equation: "J1 = Q0·X'" },
  { flipFlop: "FF for Q1", input: "K1", equation: "K1 = X'" },
  { flipFlop: "FF for Q0", input: "J0", equation: "J0 = Q1'·X" },
  { flipFlop: "FF for Q0", input: "K0", equation: "K0 = 1" },
];

export const TEACHER_STANDARD_OUTPUT_EQUATION = "Z = Q1 + Q0·X'";

export const D_REFERENCE_TRANSITIONS = [
  { present_state: "S0", input: "0", next_state: "S0", output: "0" },
  { present_state: "S0", input: "1", next_state: "S1", output: "1" },
  { present_state: "S1", input: "0", next_state: "S2", output: "1" },
  { present_state: "S1", input: "1", next_state: "S0", output: "0" },
  { present_state: "S2", input: "0", next_state: "S2", output: "0" },
  { present_state: "S2", input: "1", next_state: "S1", output: "1" },
];

export const D_REFERENCE_EQUATIONS = {
  D1: "Q1·X + Q0·X'",
  D0: "Q1'·Q0'·X",
  Z: "Q1 + Q0·X'",
};

export const D_REFERENCE_FF_INPUT_ROWS = [
  { flipFlop: "FF for Q1", input: "D1", equation: "D1 = Q1·X + Q0·X'" },
  { flipFlop: "FF for Q0", input: "D0", equation: "D0 = Q1'·Q0'·X" },
];

export const D_REFERENCE_OUTPUT_EQUATION = "Z = Q1 + Q0·X'";

export function teacherStandardInputConfig() {
  return {
    input_mode: "STATE_TABLE",
    fsm_model: "Mealy",
    ff_type: "JK",
    state_count: 3,
    input_count: 1,
    output_count: 1,
    states: ["S0", "S1", "S2"],
    inputs: ["X"],
    outputs: ["Z"],
    transitions: TEACHER_STANDARD_TRANSITIONS,
    timing_trace: null,
  };
}

function sameTransition(a, b) {
  return (
    String(a?.present_state) === b.present_state &&
    String(a?.input) === b.input &&
    String(a?.next_state) === b.next_state &&
    String(a?.output) === b.output
  );
}

export function isTeacherStandardInputConfig(inputConfig) {
  if (!inputConfig || typeof inputConfig !== "object") return false;
  if (inputConfig.input_mode !== "STATE_TABLE") return false;
  if (inputConfig.fsm_model !== "Mealy") return false;
  if (String(inputConfig.ff_type).toUpperCase() !== "JK") return false;
  if (Number(inputConfig.state_count) !== 3) return false;
  if (Number(inputConfig.input_count) !== 1 || Number(inputConfig.output_count) !== 1) return false;
  if ((inputConfig.inputs ?? [])[0] !== "X" || (inputConfig.outputs ?? [])[0] !== "Z") return false;

  const transitions = Array.isArray(inputConfig.transitions) ? inputConfig.transitions : [];
  return (
    transitions.length === TEACHER_STANDARD_TRANSITIONS.length &&
    TEACHER_STANDARD_TRANSITIONS.every((expected) =>
      transitions.some((transition) => sameTransition(transition, expected)),
    )
  );
}

export function isDReferenceInputConfig(inputConfig) {
  if (!inputConfig || typeof inputConfig !== "object") return false;
  if (inputConfig.input_mode !== "STATE_TABLE") return false;
  if (inputConfig.fsm_model !== "Mealy") return false;
  if (String(inputConfig.ff_type).toUpperCase() !== "D") return false;
  if (Number(inputConfig.state_count) !== 3) return false;
  if (Number(inputConfig.input_count) !== 1 || Number(inputConfig.output_count) !== 1) return false;
  if ((inputConfig.inputs ?? [])[0] !== "X") return false;

  const transitions = Array.isArray(inputConfig.transitions) ? inputConfig.transitions : [];
  return (
    transitions.length === D_REFERENCE_TRANSITIONS.length &&
    D_REFERENCE_TRANSITIONS.every((expected) =>
      transitions.some((transition) => sameTransition(transition, expected)),
    )
  );
}
