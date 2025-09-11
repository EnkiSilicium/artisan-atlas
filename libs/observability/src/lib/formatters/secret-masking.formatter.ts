import fastRedact from 'fast-redact';
import { format } from 'winston';

import type { TransformableInfo } from 'logform';

function maskTail(
  v: unknown,
  keep: number,
  opts: { keepLength?: boolean; placeholder?: string } = {},
): string {
  const placeholder = opts.placeholder ?? '*';
  const keepLength = opts.keepLength ?? true;

  if (typeof v !== 'string') return '[REDACTED]';

  const n = Math.max(0, Math.min(keep, v.length));
  const tail = v.slice(-n);

  if (!keepLength) return `${placeholder.repeat(8)}${tail}`; // fixed-length mask + tail
  const headLen = Math.max(0, v.length - n);
  return `${placeholder.repeat(headLen)}${tail}`; // preserve length
}

export function makeRedactFormat(paths: string[], keep = 2) {
  const redact = fastRedact({
    paths,
    serialize: false,
    strict: false,
    censor: (value: unknown) => maskTail(value, keep, { keepLength: true }),
  });

  return format((info: TransformableInfo) => {
    const redacted = redact(info);
    // mutate in place so downstream formats/transports see redacted data
    for (const k of Object.keys(info)) delete info[k];
    Object.assign(info, redacted);
    return info;
  })();
}

export const REDACTION_PATHS = [

  'KEY',
  'password',
  'pass',
  'secret',
  'token',
  'authorization',
  'headers.authorization',
  'db.password',
  'db.connectionString',
  'kafka.sasl.password',
  'kafka.sasl.secretAccessKey',
  'kafka.sasl.accessKeyId',
  'aws.secretAccessKey',
  'aws.accessKeyId',
];
