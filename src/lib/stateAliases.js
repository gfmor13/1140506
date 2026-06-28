import { formatLogicLabel } from "./normalizeFsmResult.js";

const LETTER_A = "A".charCodeAt(0);
const LETTER_Z = "Z".charCodeAt(0);

function assertPositiveStateCount(stateCount) {
  const count = Number(stateCount);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("state_count must be a positive integer");
  }
  return count;
}

export function stateIndexToAlias(index) {
  let value = Number(index);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("state index must be a non-negative integer");
  }

  let label = "";
  value += 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(LETTER_A + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function stateAliasToIndex(alias) {
  const text = String(alias ?? "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(text)) {
    throw new Error(`invalid state alias: ${alias}`);
  }

  let value = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < LETTER_A || code > LETTER_Z) {
      throw new Error(`invalid state alias: ${alias}`);
    }
    value = value * 26 + (code - LETTER_A + 1);
  }
  return value - 1;
}

export function canonicalizeStateId(value, stateCount) {
  const count = assertPositiveStateCount(stateCount);
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error("state id is required");
  }

  const sMatch = /^s(\d+)$/i.exec(text);
  const index = sMatch ? Number(sMatch[1]) : stateAliasToIndex(text);

  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`state ${value} is out of range for state_count ${count}`);
  }

  return `S${index}`;
}

export function stateIdToAlias(value) {
  const match = /^S(\d+)$/i.exec(String(value ?? "").trim());
  if (!match) {
    throw new Error(`invalid canonical state id: ${value}`);
  }
  return stateIndexToAlias(Number(match[1]));
}

export function createCanonicalStates(stateCount) {
  const count = assertPositiveStateCount(stateCount);
  return Array.from({ length: count }, (_item, index) => `S${index}`);
}

export function createAliasStates(stateCount) {
  const count = assertPositiveStateCount(stateCount);
  return Array.from({ length: count }, (_item, index) => stateIndexToAlias(index));
}

export function displaySignalName(name) {
  return formatLogicLabel(
    String(name ?? "")
      .replace(/_([A-Z])/g, (_match, bit) => bit.toLowerCase()),
  );
}

export function displayEquationText(text) {
  return formatLogicLabel(text);
}
