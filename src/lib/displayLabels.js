import { formatLogicLabel } from "./normalizeFsmResult.js";

const STATE_TOKEN_RE = /Q_([A-Z])(#?)/g;
const FF_INPUT_RE = /\b([DTJKSR])_([A-Z])\b/g;

function bitLetterToOffset(bit) {
  const code = String(bit ?? "").toUpperCase().charCodeAt(0);
  if (!Number.isFinite(code)) return 0;
  return Math.max(0, code - "A".charCodeAt(0));
}

function maxBitOffsetFromText(text) {
  let maxOffset = -1;
  for (const match of String(text ?? "").matchAll(/(?:Q_|[DTJKSR]_)([A-Z])/g)) {
    maxOffset = Math.max(maxOffset, bitLetterToOffset(match[1]));
  }
  return maxOffset;
}

export function inferStateBitCount(result) {
  const metadataBits = result?.metadata?.state_bits;
  if (Number.isInteger(metadataBits) && metadataBits > 0) return metadataBits;
  if (Array.isArray(metadataBits) && metadataBits.length > 0) return metadataBits.length;

  let maxOffset = -1;
  for (const equation of result?.equations ?? []) {
    maxOffset = Math.max(
      maxOffset,
      maxBitOffsetFromText(equation?.name),
      maxBitOffsetFromText(equation?.target),
      maxBitOffsetFromText(equation?.expression),
      ...(equation?.variables ?? []).map(maxBitOffsetFromText),
    );
  }
  for (const map of result?.kMaps ?? []) {
    maxOffset = Math.max(
      maxOffset,
      maxBitOffsetFromText(map?.target),
      maxBitOffsetFromText(map?.name),
      maxBitOffsetFromText(map?.expression),
      ...(map?.variables ?? []).map(maxBitOffsetFromText),
    );
  }
  for (const signal of result?.timingDiagram?.signals ?? []) {
    maxOffset = Math.max(maxOffset, maxBitOffsetFromText(signal?.name));
  }
  for (const node of result?.circuitLayout?.nodes ?? []) {
    maxOffset = Math.max(maxOffset, maxBitOffsetFromText(node?.id), maxBitOffsetFromText(node?.label));
  }
  for (const edge of result?.circuitLayout?.edges ?? []) {
    maxOffset = Math.max(
      maxOffset,
      maxBitOffsetFromText(edge?.from),
      maxBitOffsetFromText(edge?.to),
      maxBitOffsetFromText(edge?.label),
      maxBitOffsetFromText(edge?.signal),
    );
  }

  return Math.max(1, maxOffset + 1);
}

export function teacherBitIndex(bit, resultOrBitCount) {
  const bitCount =
    typeof resultOrBitCount === "number" ? resultOrBitCount : inferStateBitCount(resultOrBitCount);
  const offset = bitLetterToOffset(bit);
  return Math.max(0, bitCount - offset - 1);
}

export function formatTeacherLogicLabel(label, resultOrBitCount) {
  const bitCount =
    typeof resultOrBitCount === "number" ? resultOrBitCount : inferStateBitCount(resultOrBitCount);
  const teacherText = String(label ?? "")
    .replace(STATE_TOKEN_RE, (_match, bit, complement) => `Q${teacherBitIndex(bit, bitCount)}${complement ? "'" : ""}`)
    .replace(FF_INPUT_RE, (_match, pin, bit) => `${pin}${teacherBitIndex(bit, bitCount)}`);
  return formatLogicLabel(teacherText);
}

function booleanDisplayTokens(text) {
  return String(text ?? "").match(/Q\d+'?|[A-Z]\d?'?|[A-Z]'?|[01]|[+=()]/g) ?? [];
}

function isBooleanOperand(token) {
  return /^(?:Q\d+'?|[A-Z]\d?'?|[A-Z]'?|[01])$/.test(token);
}

export function formatBooleanEquationForDisplay(expression, resultOrBitCount) {
  const display = formatTeacherLogicLabel(expression, resultOrBitCount).replace(/\s*·\s*/g, "");
  const tokens = booleanDisplayTokens(display);
  if (tokens.length === 0) return display;

  let output = "";
  let previous = "";
  for (const token of tokens) {
    if (token === "=" || token === "+") {
      output = `${output.trimEnd()} ${token} `;
    } else if (token === "(") {
      if (isBooleanOperand(previous) || previous === ")") output += "·";
      output += token;
    } else if (token === ")") {
      output += token;
    } else {
      if (isBooleanOperand(previous) || previous === ")") output += "·";
      output += token;
    }
    previous = token;
  }
  return output.replace(/\s+/g, " ").trim();
}

export function teacherFfPinLabel(pin, nodeOrBit, resultOrBitCount) {
  const rawPin = String(pin ?? "");
  if (rawPin === "CLK" || rawPin === "CLR" || rawPin === "RST") return rawPin;
  const bit = typeof nodeOrBit === "string" ? nodeOrBit : String(nodeOrBit?.id ?? "").replace(/^ff_/, "");
  if (rawPin === "Q") return `Q${teacherBitIndex(bit, resultOrBitCount)}`;
  if (rawPin === "Q#") return `Q${teacherBitIndex(bit, resultOrBitCount)}'`;
  if (/^[DTJKSR]$/.test(rawPin)) return `${rawPin}${teacherBitIndex(bit, resultOrBitCount)}`;
  return rawPin;
}

export function teacherFfNodeLabel(node, resultOrBitCount) {
  const type = String(node?.type ?? "D_FF").replace("_", " ");
  const bit = String(node?.id ?? "").replace(/^ff_/, "");
  return `${type} Q${teacherBitIndex(bit, resultOrBitCount)}`;
}

export function teacherEncodingLabel(encoding, resultOrBitCount) {
  const text = String(encoding ?? "");
  if (!text) return "";
  const bitCount = typeof resultOrBitCount === "number" ? resultOrBitCount : inferStateBitCount(resultOrBitCount);
  const variables = Array.from({ length: bitCount }, (_item, index) => `Q${bitCount - index - 1}`).join("");
  return `${variables} = ${text}`;
}

export function formatTeacherEndpoint(endpoint, resultOrBitCount) {
  const text = String(endpoint ?? "");
  const match = /^ff_([A-Z]+)\.([A-Z]#?)$/.exec(text);
  if (match) {
    return `FF Q${teacherBitIndex(match[1], resultOrBitCount)}.${teacherFfPinLabel(match[2], match[1], resultOrBitCount)}`;
  }
  return formatTeacherLogicLabel(text, resultOrBitCount);
}
