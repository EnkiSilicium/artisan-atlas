import { DomainError, ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { assertIsObject } from 'shared-kernel';

import { ActorEntityFieldMap, ActorName } from 'auth';

export function assertBelongsTo(
  actor: { actorName: ActorName; id: string },
  entity: unknown,
) {
  assertIsObject(entity);
  const entityField = ActorEntityFieldMap[actor.actorName];

  if (!entityField) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: `Unknown actor name ${actor.actorName} in ${assertBelongsTo.name}`,
      },
    });
  }

  const belongsTo = entity[entityField] === actor.id;
  if (!belongsTo) {
    throw new DomainError({
      errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
      details: {
        description: `The ${actor.actorName} with id ${actor.id} does not own the order with id ${entity['orderId']}`,
      },
    });
  }
}
