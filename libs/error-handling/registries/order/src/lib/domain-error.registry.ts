import { makeRegistry } from 'error-handling/error-core';

import type { BaseDescriptor } from 'error-handling/error-core';

export const OrderDomainErrorDefs = [
  {
    code: 'NOT_FOUND',
    message: 'Entity missing',
    service: 'order-service',
    retryable: false,
    httpStatus: 404,
    v: 1,
  },
  {
    code: 'VALIDATION',
    message: 'Validation failed',
    service: 'order-service',
    retryable: false,
    httpStatus: 422,
    v: 1,
  },
  {
    code: 'INVARIANTS_VIOLATED',
    message: 'Invariants violated',
    service: 'order-service',
    retryable: false,
    httpStatus: 409,
    v: 1,
  },
  {
    code: 'ILLEGAL_TRANSITION',
    message: 'Illegal state transition',
    service: 'order-service',
    retryable: false,
    httpStatus: 409,
    v: 1,
  }, // transition not allowed from current state
  {
    code: 'EXPIRED',
    message: 'Order expired',
    service: 'order-service',
    retryable: false,
    httpStatus: 410,
    v: 1,
  },
  {
    code: 'FORBIDDEN',
    message: 'Action forbidden',
    service: 'order-service',
    retryable: false,
    httpStatus: 403,
    v: 1,
  },
  {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests',
    service: 'order-service',
    retryable: true,
    httpStatus: 429,
    v: 1,
  },
] as const satisfies readonly BaseDescriptor<string>[];

export const OrderDomainErrorRegistry = makeRegistry(
  'DOMAIN',
  OrderDomainErrorDefs,
);

export const OrderDomainErrorCodes = OrderDomainErrorRegistry.codes;
