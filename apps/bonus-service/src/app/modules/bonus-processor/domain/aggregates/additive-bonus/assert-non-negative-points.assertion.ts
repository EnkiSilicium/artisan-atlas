import { Panic } from 'error-handling/error-core';
import { PanicRegistry } from 'error-handling/registries/common';

export function assertNonNegativePoints({ points }: { points: number }): void {
  if (points < 0) {
    throw new Panic({
      errorObject: PanicRegistry.byCode.BUG,
      details: {
        description: `getGradeByPoints only allowed with positive points, received: ${points}`,
      },
    });
  }
}
