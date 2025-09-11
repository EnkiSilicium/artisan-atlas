import { validateSync } from 'class-validator';
import { DomainError } from 'error-handling/error-core';

import type { BaseDescriptor } from 'error-handling/error-core';

/**
 * Method to validate class-validator decorators on instances.
 * Lives in shared library and have to be explicitly passed the
 * domain error registry of the service you are in. Assumes the service has
 * VALIDATION error defined.
 *
 *
 * @param instance
 * @param errorRegistry domain error registry of the current service.
 * @param groups Optional decorator groups.
 */
export function assertValid<
  E extends { byCode: { ['VALIDATION']: BaseDescriptor<'VALIDATION'> } },
>(
  instance: object,
  errorRegistry: E,
  groups: string[] | undefined = undefined,
): void {
  const groupsObject = groups ? { groups: groups } : {};

  const errors = validateSync(instance, {
    //those are very permissive - throw only iff constraint on the property
    //violated, does not modify the entity.
    whitelist: false,
    forbidNonWhitelisted: false,
    forbidUnknownValues: false,
    skipMissingProperties: false,
    skipUndefinedProperties: false,
    skipNullProperties: false,
    validationError: { target: true, value: true },
    ...groupsObject,
  });
  if (errors.length) {
    throw new DomainError({
      errorObject: errorRegistry.byCode.VALIDATION,
      details: {
        message: `Domain validation of ${(instance as any)?.name ?? 'unspecified entity'} rejected the values.`
      },
      cause: {
        ...errors
      },
    });
  }
}
