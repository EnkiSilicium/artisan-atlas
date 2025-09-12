import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

import type { EntityTechnicalsInterface } from 'libs/persistence/src/lib/interfaces/entity-techncials.interface';

export function assertImplementsEntityTechnicals(
  entity: any,
): asserts entity is EntityTechnicalsInterface {
  const versionDefined = typeof entity?.version === 'number';
  const createdAtDefined =
    typeof entity?.createdAt === 'string' || entity?.createdAt instanceof Date;
  const lastUpdatedAtDefined =
    typeof entity?.lastUpdatedAt === 'string' ||
    entity?.createdAt instanceof Date;

  if (!(versionDefined && createdAtDefined && lastUpdatedAtDefined)) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { message: 'Entity does have required version or time fields' },
    });
  }
}
