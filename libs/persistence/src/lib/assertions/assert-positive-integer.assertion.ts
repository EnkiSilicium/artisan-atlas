import { Panic } from 'error-handling/error-core';
import { PanicRegistry } from 'error-handling/registries/common';

interface AssertPositiveIntegerParams {
  value: number;
  description: string;
}

export function assertPositiveInteger({
  value,
  description,
}: AssertPositiveIntegerParams): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Panic({
      errorObject: PanicRegistry.byCode.BUG,
      details: { description },
    });
  }
}
