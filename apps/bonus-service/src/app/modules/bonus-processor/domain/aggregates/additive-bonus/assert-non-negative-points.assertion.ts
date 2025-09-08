import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

export function assertNonNegativePoints({
  points,
}: {
  points: number;
}): void {
  if (points < 0) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: `getGradeByPoints only allowed with positive points, received: ${points}`,
      },
    });
  }
}
