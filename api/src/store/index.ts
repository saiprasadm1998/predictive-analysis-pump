import { config } from "../config.js";
import { memoryStore } from "./memory.js";
import { mongoStore } from "./mongo.js";
import type { Store } from "./types.js";

export function createStore(): Store {
  return config.mongoUri ? mongoStore(config.mongoUri, config.mongoDb) : memoryStore();
}
export type { Store };
export { DuplicateError } from "./types.js";
