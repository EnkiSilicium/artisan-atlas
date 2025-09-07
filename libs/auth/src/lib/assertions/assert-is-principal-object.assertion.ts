import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

import { Principal } from '../types/principal.type';

export function assertIsPrincipalObject(object: unknown): asserts object is Principal {
  if (
    typeof object !== 'object' ||
    object === null ||
    typeof (object as any).actorName !== 'string' ||
    typeof (object as any).id !== 'string'
  ) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: 'Principal is expected to be present - ensure this guard is placed behind auth',
      },
    });
  }
}
