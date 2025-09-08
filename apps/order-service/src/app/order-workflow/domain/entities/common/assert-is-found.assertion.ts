import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';

export function assertIsFound<E extends { name: string }>(
  object: unknown,
  entity: E,
  ids?: {
    orderId?: string;
    commissionerId?: string;
    workshopId?: string;
  },
): asserts object is E {
  if (!object) {
    throw new DomainError({
      errorObject: OrderDomainErrorRegistry.byCode.NOT_FOUND,
      details: {
        description: `${entity?.name} entity with orderId: ${ids?.orderId} does not exist`,
        entity: entity?.name,
        orderId: ids?.orderId,
        commissionerId: ids?.commissionerId,
        workshopId: ids?.workshopId,
      },
    });
  }
}
