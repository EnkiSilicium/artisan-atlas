import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

interface AssertPositiveIntegerParams {
  value: number;
  description: string;
}

export function assertPositiveInteger({
  value,
  description,
}: AssertPositiveIntegerParams): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { description },
    });
  }
}
