import { memoryStore } from "./memory.js";
import type { Store } from "./types.js";

export function createStore(): Store {
  return memoryStore();
}
export type { Store };
export { DuplicateError } from "./types.js";
