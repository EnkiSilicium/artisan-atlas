import type { BaseDescriptor } from 'error-handling/error-core';
import type { ErrorRegistryInterface } from 'error-handling/error-core';
import { assertValidErrorRegistryDefs } from './assert-valid-error-registry-defs.assertion';

/**
 * Build a closed, non-extendable registry for a single service and kind.
 * `kind` is used only to form the human-readable name.
 */

export function makeRegistry<const D extends readonly BaseDescriptor<string>[]>(
  kind: 'DOMAIN' | 'INFRA' | 'PROGRAMMER',
  defs: D,
): ErrorRegistryInterface<D[number]['code']> {
  assertValidErrorRegistryDefs(defs);
  const service = defs[0].service;

  type C = D[number]['code'];

  const byCode = Object.freeze(
    defs.reduce(
      (acc, d) => {
        (acc as Record<string, BaseDescriptor<C>>)[d.code] = Object.freeze({
          ...d,
        });
        return acc;
      },
      {} as { [K in C]: BaseDescriptor<K> },
    ),
  );

  const codes = Object.freeze(
    defs.reduce(
      (acc, d) => {
        (acc as Record<string, C>)[d.code] = d.code;
        return acc;
      },
      {} as { [K in C]: K },
    ),
  );

  const toPascal = (s: string) =>
    s.replace(/(^\w|[-_]\w)/g, (m) => m.replace(/[-_]/, '').toUpperCase());
  const name = `${toPascal(service)}_${kind}`;

  return Object.freeze({
    name,
    service,
    byCode,
    codes,
    list: Object.freeze([...defs]) as ReadonlyArray<BaseDescriptor<C>>,
  });
}
