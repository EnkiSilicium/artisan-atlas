import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import type { JwtPayload } from '../strategies/jwt.strategy';

export function assertValidJwtPayload(
  payload: Partial<JwtPayload> | null | undefined,
): asserts payload is JwtPayload {
  if (!payload?.sub || !payload?.actorName) {
    throw new DomainError({
      errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
      details: {
        message: "Incorrect JWT shape - no 'sub' or 'actorName",
        sub: payload?.sub,
        actorName: payload?.actorName,
      },
    });
  }
}
