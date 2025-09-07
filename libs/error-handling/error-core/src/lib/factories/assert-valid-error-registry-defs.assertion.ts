import type { BaseDescriptor } from '../interfaces/base-descriptor.interface';

export function assertValidErrorRegistryDefs<D extends BaseDescriptor<string>>(
  defs: readonly D[],
): asserts defs is readonly [D, ...D[]] {
  if (defs.length === 0) {
    throw new Error('Empty error registry');
  }
  const service = defs[0].service;
  for (const d of defs) {
    if (d.service !== service) {
      throw new Error(
        `Mixed "service" values in one registry (${service} vs ${d.service})`,
      );
    }
  }
}
