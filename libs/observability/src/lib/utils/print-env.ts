import { Logger } from '@nestjs/common';

type Extra = { env: unknown; description: string };

function normalizeValue(v: unknown): string {
  if (v === undefined) return '(unset)';
  if (v === null) return '(null)';
  const s = String(v);
  return s === '' ? '(empty)' : s;
}

function nameFromDescription(desc: string): string {
  const m = desc.match(/^([A-Z0-9_\.:-]+)/);
  return m ? m[1] : 'EXTRA';
}

export function printEnvs(serviceLabel: string, extras: Extra[] = []): void {
  const rows: Array<{ name: string; value: string; description: string }> = [];

  // -------- Common across both services --------
  // Logging
  rows.push({
    name: 'NODE_ENV',
    value: normalizeValue(process.env.NODE_ENV),
    description: 'Node runtime environment',
  });
  rows.push({
    name: 'DEBUG',
    value: normalizeValue(process.env.DEBUG),
    description: 'Enable debug logging',
  });
  rows.push({
    name: 'LOGFILE_OUTPUT_LOCATION',
    value: normalizeValue(process.env.LOGFILE_OUTPUT_LOCATION),
    description: 'Log file path inside container',
  });

  // HTTP
  rows.push({
    name: 'HTTP_PREFIX',
    value: normalizeValue(process.env.HTTP_PREFIX),
    description: 'HTTP route prefix',
  });

  // Redis
  rows.push({
    name: 'REDIS_HOST',
    value: normalizeValue(process.env.REDIS_HOST),
    description: 'Redis hostname',
  });
  rows.push({
    name: 'REDIS_PORT',
    value: normalizeValue(process.env.REDIS_PORT),
    description: 'Redis port',
  });

  // Database
  rows.push({
    name: 'PG_URL',
    value: normalizeValue(process.env.PG_URL),
    description:
      'Full Postgres URL (optional; overrides discrete fields if set)',
  });
  rows.push({
    name: 'PG_HOST',
    value: normalizeValue(process.env.PG_HOST),
    description: 'Postgres hostname',
  });
  rows.push({
    name: 'PG_PORT',
    value: normalizeValue(process.env.PG_PORT),
    description: 'Postgres port',
  });
  rows.push({
    name: 'PG_USER',
    value: normalizeValue(process.env.PG_USER),
    description: 'Postgres user',
  });
  // rows.push({
  //   name: 'PG_PASSWORD',
  //   value: normalizeValue(process.env.PG_PASSWORD),
  //   description: 'Postgres password',
  // });
  rows.push({
    name: 'PG_DB',
    value: normalizeValue(process.env.PG_DB),
    description: 'Postgres database name',
  });
  rows.push({
    name: 'DB_SCHEMA',
    value: normalizeValue(process.env.DB_SCHEMA),
    description: 'Postgres schema',
  });
  rows.push({
    name: 'PG_SSL',
    value: normalizeValue(process.env.PG_SSL),
    description: 'Use SSL to DB (true/false)',
  });
  rows.push({
    name: 'PG_POOL_MAX',
    value: normalizeValue(process.env.PG_POOL_MAX),
    description: 'DB pool size max',
  });
  rows.push({
    name: 'PG_POOL_MIN',
    value: normalizeValue(process.env.PG_POOL_MIN),
    description: 'DB pool size min',
  });
  rows.push({
    name: 'PG_POOL_IDLE_MS',
    value: normalizeValue(process.env.PG_POOL_IDLE_MS),
    description: 'DB idle timeout (ms)',
  });
  rows.push({
    name: 'PG_POOL_CONN_MS',
    value: normalizeValue(process.env.PG_POOL_CONN_MS),
    description: 'DB connection timeout (ms)',
  });
  rows.push({
    name: 'TYPEORM_LOGGING',
    value: normalizeValue(process.env.TYPEORM_LOGGING),
    description: 'TypeORM logging level(s)',
  });
  rows.push({
    name: 'TYPEORM_SLOW_MS',
    value: normalizeValue(process.env.TYPEORM_SLOW_MS),
    description: 'Slow query threshold (ms)',
  });

  // Kafka
  rows.push({
    name: 'KAFKA_BROKER_HOSTNAME',
    value: normalizeValue(process.env.KAFKA_BROKER_HOSTNAME),
    description: 'Kafka broker hostname',
  });
  rows.push({
    name: 'KAFKA_BROKER_PORT',
    value: normalizeValue(process.env.KAFKA_BROKER_PORT),
    description: 'Kafka broker port',
  });
  rows.push({
    name: 'KAFKA_CLIENT_ID',
    value: normalizeValue(process.env.KAFKA_CLIENT_ID),
    description: 'Kafka client id',
  });
  rows.push({
    name: 'KAFKA_CONSUMER_GROUPID',
    value: normalizeValue(process.env.KAFKA_CONSUMER_GROUPID),
    description: 'Kafka consumer group id',
  });
  rows.push({
    name: 'KAFKA_RETRIES',
    value: normalizeValue(process.env.KAFKA_RETRIES),
    description: 'Kafka client retries',
  });
  rows.push({
    name: 'KAFKA_AWS_MODE',
    value: normalizeValue(process.env.KAFKA_AWS_MODE),
    description: 'Use AWS auth mode (true/false)',
  });
  rows.push({
    name: 'KAFKA_AUTH_ROLEID',
    value: normalizeValue(process.env.KAFKA_AUTH_ROLEID),
    description: 'Kafka role id (if AWS mode)',
  });
  // rows.push({
  //   name: 'KAFKA_AUTH_ACCESSKEYID',
  //   value: normalizeValue(process.env.KAFKA_AUTH_ACCESSKEYID),
  //   description: 'Kafka access key id (if AWS mode)',
  // });
  // rows.push({
  //   name: 'KAFKA_AUTH_SECRETACCESSKEY',
  //   value: normalizeValue(process.env.KAFKA_AUTH_SECRETACCESSKEY),
  //   description: 'Kafka secret access key (if AWS mode)',
  // });

  // Messaging
  rows.push({
    name: 'USE_REDIS_MQ',
    value: normalizeValue(process.env.USE_REDIS_MQ),
    description: 'Use Redis as MQ (true/false)',
  });

  // -------- Service-specific extras --------
  for (const e of extras) {
    rows.push({
      name: nameFromDescription(e.description),
      value: normalizeValue(e.env),
      description: e.description,
    });
  }

  // Print
  // eslint-disable-next-line no-console
  console.info(`[ENV] ${serviceLabel}`);

  Logger.debug(rows);
}
