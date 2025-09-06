import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import type { Ambient } from '../interfaces/transaction-context.type';


export function assertInsideTransaction<K extends keyof Ambient>(
  ambient: Ambient | undefined,
  ensure: K,
  whenCalledFrom: string,

): asserts ambient is Ambient & {
  [P in K]-?: NonNullable<Ambient[P]>;
} {
  if (!ambient || !ambient[ensure]) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: `using '${whenCalledFrom}' outside of transaction`,
      },
    });
  }
}
