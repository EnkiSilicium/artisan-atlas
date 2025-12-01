import { Panic } from 'error-handling/error-core';
import { PanicRegistry } from 'error-handling/registries/common';

export function assertJwtKeyDefined(
  keys: string[],
): asserts keys is [string, ...string[]] {
  if (!keys.length) {
    throw new Panic({
      errorObject: PanicRegistry.byCode.BUG,
      details: { message: `JWT key undefined!` },
    });
  }
}
