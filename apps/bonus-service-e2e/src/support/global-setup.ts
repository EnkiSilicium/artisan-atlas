/* eslint-disable */
import { waitForPortOpen } from '@nx/node/utils';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

type Stack = {
  pg: StartedPostgreSqlContainer;
  kafka: StartedKafkaContainer;
  redis: StartedTestContainer;
  app: ChildProcessWithoutNullStreams;
};

declare global {
  // eslint-disable-next-line no-var
  var __E2E_STACK__: Stack;
}

module.exports = async function () {
  console.log('\n[E2E] Setting up Postgres, Kafka, Redis, and app...\n');

  // Postgres
  const pg = await new PostgreSqlContainer('postgres:16-alpine').start();

  // Kafka
  const KAFKA_IMAGE = process.env.KAFKA_IMAGE ?? 'confluentinc/cp-kafka:7.5.3';
  const kafka = await new KafkaContainer(KAFKA_IMAGE).withStartupTimeout(120_000).start();
  const anyKafka = kafka as any;
  const bootstrap: string =
    typeof anyKafka.getBootstrapServers === 'function'
      ? anyKafka.getBootstrapServers()
      : `${kafka.getHost()}:${kafka.getMappedPort(9093)}`;

  // Redis
  const REDIS_IMAGE = process.env.REDIS_IMAGE ?? 'redis:7-alpine';
  const redis = await new GenericContainer(REDIS_IMAGE)
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const REDIS_HOST = redis.getHost();                  // usually 127.0.0.1 on the runner
  const REDIS_PORT = String(redis.getMappedPort(6379)); // mapped high port

  // App HTTP ports
  const PROC_PORT = Number(process.env.BONUS_PROC_HTTP_PORT ?? 3001);
  const READ_PORT = Number(process.env.BONUS_READ_HTTP_PORT ?? 3002);

  // Shared env for app + tests
  const env = {
    ...process.env,

    // Postgres
    PG_HOST: pg.getHost(),
    PG_PORT: String(pg.getMappedPort(5432)),
    PG_USER: pg.getUsername(),
    PG_PASSWORD: pg.getPassword(),
    PG_DB: pg.getDatabase(),
    DB_SCHEMA: 'public',

    // Kafka
    KAFKA_BOOTSTRAP: bootstrap,
    KAFKA_BROKER_HOSTNAME: bootstrap.split(':')[0],
    KAFKA_BROKER_PORT: bootstrap.split(':')[1],

    // Redis 
    REDIS_HOST,
    REDIS_PORT,
    REDIS_URL: `redis://${REDIS_HOST}:${REDIS_PORT}`,

    USE_REDIS_MQ: 'false',

    // App HTTP
    BONUS_PROC_HTTP_PORT: String(PROC_PORT),
    BONUS_READ_HTTP_PORT: String(READ_PORT),
    HTTP_PREFIX: 'api',
    READ_BASE_URL: `http://127.0.0.1:${READ_PORT}`,
  };

  // Built entry


  await new Promise((r) => setTimeout(r, 8000))

  const entry = path.join(process.cwd(), 'dist', 'apps', 'bonus-service', 'main.js');
  if (!fs.existsSync(entry)) {
    throw new Error(
      `[E2E] Built entry not found at ${entry}. Ensure "bonus-service:build" ran before e2e.`,
    );
  }

  // Spawn app with the correct env (including Redis overrides)
  const app = spawn('node', [entry], {
    env,
    stdio: 'inherit',
    shell: true,
  });

  // Wait for the app’s HTTP ports to open
  await waitForPortOpen(PROC_PORT, { host: '127.0.0.1' });
  await waitForPortOpen(READ_PORT, { host: '127.0.0.1' });

  // Also ensure Redis port is reachable from the host (paranoid but helpful in CI)
  await waitForPortOpen(Number(REDIS_PORT), { host: REDIS_HOST });

  // Expose handles for teardown
  (globalThis as any).__E2E_STACK__ = { pg, kafka, redis, app };

  // Make the vars available to tests
  process.env.KAFKA_BOOTSTRAP = env.KAFKA_BOOTSTRAP;
  process.env.READ_BASE_URL = env.READ_BASE_URL;
  process.env.REDIS_HOST = env.REDIS_HOST;
  process.env.REDIS_PORT = env.REDIS_PORT;
  process.env.REDIS_URL = env.REDIS_URL;

  console.log(`[E2E] Kafka bootstrap: ${env.KAFKA_BOOTSTRAP}`);
  console.log(`[E2E] Redis: ${env.REDIS_URL}`);
  console.log(`[E2E] Read base URL: ${env.READ_BASE_URL}\n`);
};
