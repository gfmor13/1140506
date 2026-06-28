import { normalizeImportedInputConfig } from "../src/lib/inputConfigBuilder.js";

export function validateInputConfig(input) {
  try {
    return normalizeImportedInputConfig(input);
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
}
