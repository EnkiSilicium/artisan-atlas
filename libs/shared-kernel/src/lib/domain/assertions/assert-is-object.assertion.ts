import { ProgrammerError } from "error-handling/error-core";
import { ProgrammerErrorRegistry } from "error-handling/registries/common";

export function assertIsObject(v: unknown): asserts v is Record<string, unknown> {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) {
    // function is allowed because functions have properties too
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG
    });
  }
}