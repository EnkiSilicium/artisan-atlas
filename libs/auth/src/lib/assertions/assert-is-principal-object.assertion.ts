import { Panic } from 'error-handling/error-core';
import { PanicRegistry } from 'error-handling/registries/common';

import type { Principal } from '../types/principal.type';

export function assertIsPrincipalObject(
  object: Record<string, unknown>,
): asserts object is Principal {
  if (
    typeof object['actorName'] !== 'string' ||
    typeof object['id'] !== 'string'
  ) {
    throw new Panic({
      errorObject: PanicRegistry.byCode.BUG,
      details: {
        description:
          'Principal is expected to be present - ensure this guard is placed behind auth',
      },
    });
  }
}
