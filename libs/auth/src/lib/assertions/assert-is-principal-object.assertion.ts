import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

import type { Principal } from '../types/principal.type';

export function assertIsPrincipalObject(
  object: Record<string, unknown>,
): asserts object is Principal {
  if (
    typeof object['actorName'] !== 'string' ||
    typeof object['id'] !== 'string'
  ) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description:
          'Principal is expected to be present - ensure this guard is placed behind auth',
      },
    });
  }
}
