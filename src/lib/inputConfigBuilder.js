import {
  canonicalizeStateId,
  createAliasStates,
  createCanonicalStates,
  stateIndexToAlias,
} from "./stateAliases.js";

const FSM_MODELS = new Set(["Mealy", "Moore"]);
const FF_TYPES = new Set(["D", "T", "JK", "SR"]);
const INPUT_MODES = new Set(["STATE_TABLE", "TIMING_TRACE"]);
const IMPORT_RESULT_KEYS = [
  "status",
  "equations",
  "k_maps",
  "state_graph",
  "timing_diagram",
  "circuit_layout",
];
const IMPORT_INPUT_KEYS = ["input_mode", "fsm_model", "ff_type", "transitions", "timing_trace"];

export const INPUT_MODE_LABELS = {
  STATE_TABLE: "State Table",
  TIMING_TRACE: "Timing Trace",
  IMPORT_JSON: "Import JSON",
};

export function inputModeFromLabel(label) {
  if (label === INPUT_MODE_LABELS.TIMING_TRACE) return "TIMING_TRACE";
  if (label === INPUT_MODE_LABELS.IMPORT_JSON) return "IMPORT_JSON";
  return "STATE_TABLE";
}

function positiveInteger(value, fieldName, fallback) {
  const source = value === undefined || value === null || value === "" ? fallback : value;
  const number = Number(source);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return number;
}

function enumValue(value, fieldName, allowed, fallback) {
  const source = value === undefined || value === null || value === "" ? fallback : value;
  if (!allowed.has(source)) {
    throw new Error(`${fieldName} must be one of ${Array.from(allowed).join(", ")}`);
  }
  return source;
}

function binaryValue(value, fieldName) {
  const text = String(value ?? "").trim();
  if (text !== "0" && text !== "1") {
    throw new Error(`${fieldName} must be 0 or 1`);
  }
  return text;
}

function normalizeTraceArray(value, fieldName) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const text = String(item ?? "").trim();
      if (text !== "0" && text !== "1") {
        throw new Error("Timing Trace contains non-binary value");
      }
      return text;
    });
  }
  return parseTimingTraceValues(value);
}

function normalizeCommonConfig(input = {}) {
  const stateCount = positiveInteger(input.state_count ?? input.stateCount, "state_count", 2);
  if (stateCount > 8) {
    throw new Error("Phase 4A supports up to 8 states");
  }
  return {
    fsm_model: enumValue(input.fsm_model ?? input.fsmModel, "fsm_model", FSM_MODELS, "Mealy"),
    ff_type: enumValue(input.ff_type ?? input.ffType, "ff_type", FF_TYPES, "D"),
    state_count: stateCount,
    input_count: positiveInteger(input.input_count ?? input.inputCount, "input_count", 1),
    output_count: positiveInteger(input.output_count ?? input.outputCount, "output_count", 1),
  };
}

export function buildDefaultStateRows({ stateCount, fsmModel = "Mealy" }) {
  const count = positiveInteger(stateCount, "state_count", 2);
  const model = enumValue(fsmModel, "fsm_model", FSM_MODELS, "Mealy");
  return Array.from({ length: count }, (_item, index) => {
    const presentState = stateIndexToAlias(index);
    const nextState0 = stateIndexToAlias(index);
    const nextState1 = stateIndexToAlias((index + 1) % count);
    if (model === "Moore") {
      return { presentState, nextState0, nextState1, output: index % 2 === 0 ? "0" : "1" };
    }
    return {
      presentState,
      nextState0,
      output0: "0",
      nextState1,
      output1: index % 2 === 0 ? "1" : "0",
    };
  });
}

export function reconcileStateRows({ rows = [], stateCount, fsmModel }) {
  const defaults = buildDefaultStateRows({ stateCount, fsmModel });
  return defaults.map((defaultRow, index) => {
    const previous = rows[index] ?? {};
    return {
      ...defaultRow,
      ...previous,
      presentState: defaultRow.presentState,
    };
  });
}

export function parseTimingTraceValues(text) {
  const source = String(text ?? "").trim();
  if (!source) {
    throw new Error("timing trace is required");
  }
  const stripped = source.replace(/[\s,._|]/g, "");
  if (!/^[01]+$/.test(stripped)) {
    throw new Error("Timing Trace contains non-binary value");
  }
  return Array.from(stripped);
}

export function buildStateTableInputConfig({
  fsmModel = "Mealy",
  ffType = "D",
  stateCount = 2,
  inputCount = 1,
  outputCount = 1,
  rows = [],
}) {
  const common = normalizeCommonConfig({
    fsm_model: fsmModel,
    ff_type: ffType,
    state_count: stateCount,
    input_count: inputCount,
    output_count: outputCount,
  });

  if (common.input_count !== 1 || common.output_count !== 1) {
    throw new Error("State Table supports exactly one input X and one output Z");
  }

  if (!Array.isArray(rows) || rows.length < common.state_count) {
    throw new Error("state table must contain one row per state");
  }

  const transitions = [];
  for (let index = 0; index < common.state_count; index += 1) {
    const row = rows[index];
    const presentState = canonicalizeStateId(row.presentState ?? stateIndexToAlias(index), common.state_count);
    const nextState0 = canonicalizeStateId(row.nextState0, common.state_count);
    const nextState1 = canonicalizeStateId(row.nextState1, common.state_count);

    if (common.fsm_model === "Moore") {
      const output = binaryValue(row.output, `${row.presentState || presentState} output`);
      transitions.push(
        { present_state: presentState, input: "0", next_state: nextState0, output },
        { present_state: presentState, input: "1", next_state: nextState1, output },
      );
    } else {
      transitions.push(
        {
          present_state: presentState,
          input: "0",
          next_state: nextState0,
          output: binaryValue(row.output0, `${row.presentState || presentState} output X=0`),
        },
        {
          present_state: presentState,
          input: "1",
          next_state: nextState1,
          output: binaryValue(row.output1, `${row.presentState || presentState} output X=1`),
        },
      );
    }
  }

  return {
    input_mode: "STATE_TABLE",
    ...common,
    states: createCanonicalStates(common.state_count),
    inputs: ["X"],
    outputs: ["Z"],
    transitions,
    timing_trace: null,
  };
}

export function buildTimingTraceInputConfig({
  fsmModel = "Mealy",
  ffType = "D",
  stateCount = 2,
  inputCount = 1,
  outputCount = 1,
  xTrace = "",
  zTrace = "",
}) {
  const common = normalizeCommonConfig({
    fsm_model: fsmModel,
    ff_type: ffType,
    state_count: stateCount,
    input_count: inputCount,
    output_count: outputCount,
  });

  if (common.input_count !== 1 || common.output_count !== 1) {
    throw new Error("Phase 1B timing trace supports exactly one input X and one output Z");
  }

  const xValues = parseTimingTraceValues(xTrace);
  const zValues = parseTimingTraceValues(zTrace);
  if (xValues.length !== zValues.length) {
    throw new Error("Timing Trace X/Z length mismatch");
  }
  if (xValues.length < 2) {
    throw new Error("Timing Trace requires at least 2 samples");
  }

  return {
    input_mode: "TIMING_TRACE",
    ...common,
    states: createCanonicalStates(common.state_count),
    inputs: ["X"],
    outputs: ["Z"],
    transitions: [],
    timing_trace: {
      X: xValues,
      Z: zValues,
    },
  };
}

export function classifyImportJson(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (IMPORT_RESULT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    return "FSM_RESULT";
  }
  if (IMPORT_INPUT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    return "INPUT_CONFIG";
  }
  return "UNKNOWN";
}

export function normalizeImportedInputConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("InputConfig must be an object");
  }

  const common = normalizeCommonConfig(input);
  const rawMode = String(input.input_mode ?? input.inputMode ?? "STATE_TABLE").toUpperCase();
  const inputMode = enumValue(rawMode, "input_mode", INPUT_MODES, "STATE_TABLE");
  const defaultOutputs = ["Z"];
  const states = Array.isArray(input.states)
    ? input.states.map((state) => canonicalizeStateId(state, common.state_count))
    : createCanonicalStates(common.state_count);
  const inputs = Array.isArray(input.inputs) && input.inputs.length ? input.inputs.map(String) : ["X"];
  const outputs =
    Array.isArray(input.outputs) && input.outputs.length ? input.outputs.map(String) : defaultOutputs;

  const transitions = Array.isArray(input.transitions)
    ? input.transitions.map((transition, index) => ({
        present_state: canonicalizeStateId(
          transition.present_state ?? transition.presentState,
          common.state_count,
        ),
        input: binaryValue(transition.input, `transitions[${index}].input`),
        next_state: canonicalizeStateId(transition.next_state ?? transition.nextState, common.state_count),
        output: binaryValue(transition.output, `transitions[${index}].output`),
      }))
    : [];

  let timingTrace = null;
  if (inputMode === "TIMING_TRACE") {
    const rawTrace = input.timing_trace ?? input.timingTrace;
    if (rawTrace && typeof rawTrace === "object" && !Array.isArray(rawTrace)) {
      const xValues = normalizeTraceArray(rawTrace.X, "timing_trace.X");
      const zValues = normalizeTraceArray(rawTrace.Z, "timing_trace.Z");
      if (xValues.length !== zValues.length) {
        throw new Error("Timing Trace X/Z length mismatch");
      }
      if (xValues.length < 2) {
        throw new Error("Timing Trace requires at least 2 samples");
      }
      timingTrace = { X: xValues, Z: zValues };
    }
  }

  return {
    input_mode: inputMode,
    ...common,
    states,
    inputs,
    outputs,
    transitions,
    timing_trace: timingTrace,
  };
}

function validateStateTableTransitions(config, errors) {
  if (config.input_mode !== "STATE_TABLE") return;

  const stateSet = new Set(config.states);
  const seen = new Set();
  const mooreOutputs = new Map();

  for (const transition of config.transitions) {
    if (!stateSet.has(transition.present_state)) {
      errors.push(`transition present_state ${transition.present_state} is not declared`);
    }
    if (!stateSet.has(transition.next_state)) {
      errors.push(`transition next_state ${transition.next_state} is not declared`);
    }

    const key = `${transition.present_state}|${transition.input}`;
    if (seen.has(key)) {
      errors.push(`duplicate transition for ${transition.present_state} input ${transition.input}`);
    }
    seen.add(key);

    if (config.fsm_model === "Moore") {
      const previousOutput = mooreOutputs.get(transition.present_state);
      if (previousOutput !== undefined && previousOutput !== transition.output) {
        errors.push("Moore output inconsistency");
      }
      mooreOutputs.set(transition.present_state, transition.output);
    }
  }

  for (const state of config.states) {
    for (const input of ["0", "1"]) {
      if (!seen.has(`${state}|${input}`)) {
        errors.push(`missing transition for ${state} input ${input}`);
      }
    }
  }
}

export function validateInputConfigLocal(inputConfig) {
  const errors = [];
  let config = null;

  try {
    config = normalizeImportedInputConfig(inputConfig);
    if (config.states.length !== config.state_count) {
      errors.push("states length must match state_count");
    }
    if (config.input_mode === "STATE_TABLE" && config.transitions.length === 0) {
      errors.push("STATE_TABLE input requires transitions");
    }
    if (config.input_mode === "TIMING_TRACE" && !config.timing_trace) {
      errors.push("TIMING_TRACE input requires timing_trace");
    }
    validateStateTableTransitions(config, errors);
  } catch (error) {
    errors.push(error.message);
  }

  return {
    ok: errors.length === 0,
    errors,
    config,
  };
}
