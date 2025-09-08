import { ProgrammerError, InfraError } from 'error-handling/error-core';
import {
  ProgrammerErrorRegistry,
  InfraErrorRegistry,
} from 'error-handling/registries/common';

import { assertPositiveInteger } from '../assertions/assert-positive-integer.assertion';

import { assertImplementsEntityTechnicals } from 'libs/persistence/src/lib/assertions/assert-implements-entity-technicals.assertion';
import { assertIsObject, isoNow } from 'shared-kernel';

import type { DataSource, EntityManager, ObjectType } from 'typeorm';

/**
 * A function enforcing optimistic concurerncy on insert.
 * Also bumps in-memory entity's version and 'lastUpdated'.
 *
 * @param input
 * @returns current version
 */
export async function updateWithVersionGuard<T extends object>(input: {
  entityManager: EntityManager;
  target: ObjectType<T>;
  /** fields to update (ENTITY PROPERTY NAMES) */
  set: Partial<T>;
  /** current in-memory version (must be > 0) */
  currentVersion: number;
  /**
   * PK filter (ENTITY PROPERTY NAMES).
   * If omitted, we will try to derive it from `entity` using PK metadata.
   */
  pkWhere?: Partial<T>;
  /** optional in-memory entity to bump time+version */
  entity: T & { version: number; lastUpdatedAt?: string };
}): Promise<number> {
  const { entityManager, target, currentVersion } = input;

  // TypeORM 0.3 uses dataSource; older code sometimes exposes connection
  assertIsObject(entityManager);
  const ds: DataSource =
    (entityManager['dataSource'] as DataSource) ?? entityManager['connection'];
  const meta = ds.getMetadata(target);

  assertPositiveInteger({
    value: currentVersion,
    description: `version must be a positive integer; do not use ${updateWithVersionGuard.name} for inserts`,
  });

  assertImplementsEntityTechnicals(input.entity);

  const versionProperty = 'version';

  // Resolve PK property names
  const pkProps: string[] = meta.primaryColumns.map((c: unknown) => {
    assertIsObject(c);
    return c['propertyName'] as string;
  });
  if (pkProps.length === 0) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { description: `entity ${meta.name} has no primary key` },
    });
  }

  // Build pkWhere from input or from the entity instance
  let pkWhere: Record<string, unknown> | undefined = input.pkWhere as
    | Record<string, unknown>
    | undefined;
  if (!pkWhere && input.entity) {
    assertIsObject(input.entity);
    const entityObj = input.entity as Record<string, unknown>;
    pkWhere = Object.fromEntries(pkProps.map((p) => [p, entityObj[p]]));
  }

  // Validate pkWhere completeness and values
  if (!pkWhere || typeof pkWhere !== 'object' || Array.isArray(pkWhere)) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: `'pkWhere' must be an object with all PKs`,
      },
    });
  }
  for (const pk of pkProps) {
    const v = pkWhere[pk];
    if (v === undefined || v === null) {
      throw new ProgrammerError({
        errorObject: ProgrammerErrorRegistry.byCode.BUG,
        details: {
          description: `missing PK field '${pk}' in pkWhere/entity for ${meta.name}`,
        },
      });
    }
  }

  // Prepare SET payload
  assertIsObject(input.set);
  if (Array.isArray(input.set)) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { description: `'set' must be a non-array object` },
    });
  }

  const now = isoNow();
  const setInput = { ...(input.set as Record<string, unknown>) };

  // Forbid PK updates
  for (const pk of pkProps) {
    if (pk in setInput) {
      throw new ProgrammerError({
        errorObject: ProgrammerErrorRegistry.byCode.BUG,
        details: {
          description: `attempt to update primary key property '${pk}'`,
        },
      });
    }
  }

  // Scrub accidental version from SET; bump lastUpdatedAt timestamp
  delete setInput[versionProperty];
  setInput['lastUpdatedAt'] = now;

  // Build WHERE: PKs + optimistic guard on current version
  const whereObj = {
    ...(pkWhere as object),
    [versionProperty]: currentVersion,
  } as Record<string, unknown>;

  // Execute single atomic update
  const qb = entityManager
    .createQueryBuilder()
    .update(target)
    .set({
      ...setInput,
      [versionProperty]: currentVersion + 1,
    })
    .where(whereObj);

  const res = await qb.execute();

  if (res.affected !== 1) {
    // not found or stale version, both are optimistic misses
    throw new InfraError({
      errorObject: InfraErrorRegistry.byCode.TX_CONFLICT,
      details: { description: 'Optimistic lock error' },
    });
  }

  // Bump the in-memory entity if provided
  if (input.entity) {
    assertIsObject(input.entity);
    input.entity[versionProperty] = currentVersion + 1;
    input.entity['lastUpdatedAt'] = now;
  }

  return currentVersion + 1;
}
