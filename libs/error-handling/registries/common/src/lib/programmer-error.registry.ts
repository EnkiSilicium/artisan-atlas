// PROGRAMMER registry

import { makeRegistry } from 'error-handling/error-core';

export const PanicDefs = [
  {
    code: 'BUG',
    message: 'Internal invariant violated',
    service: 'unspecified',
    retryable: false,
    httpStatus: 500,
    v: 1,
  },
] as const;

export const PanicRegistry = makeRegistry(
  'PROGRAMMER',
  PanicDefs,
);
export const PanicCodes = PanicRegistry.codes;
