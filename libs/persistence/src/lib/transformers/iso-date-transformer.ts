/* eslint-disable */
import type { ValueTransformer } from 'typeorm';
/** Maps string <-> Date for timestamptz columns; property type stays `string` in code. */
export const IsoDateTransformer: ValueTransformer = {
  to: (value?: any) =>
    value == null || value instanceof Date
      ? value
      : typeof value == 'string' || 'number'
        ? new Date(value)
        : 'not-a-data, check transformer',
  from: (value?: Date | null) => (value == null ? value : value.toISOString()),
};
