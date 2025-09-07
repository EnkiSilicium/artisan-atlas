import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

export function assertJwtKeyDefined(
  keys: string[],
): asserts keys is [string, ...string[]] {
  if (!keys.length) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { message: `JWT key undefined!` },
    });
  }
}
