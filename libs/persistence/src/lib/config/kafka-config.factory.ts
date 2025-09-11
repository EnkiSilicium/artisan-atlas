import { Transport } from '@nestjs/microservices';
import { logLevel } from '@nestjs/microservices/external/kafka.interface';
import { extractBoolEnv, extractStrEnvWithFallback } from 'shared-kernel';

import type { MicroserviceOptions } from '@nestjs/microservices';
import type {
  KafkaConfig,
  ConsumerConfig,
  ProducerConfig,
  ConsumerRunConfig,
  SASLOptions,
} from '@nestjs/microservices/external/kafka.interface';

export type AwsIamAuth = {
  enabled?: boolean;
  authorizationIdentity?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  ssl?: boolean;
};

export type KafkaFactoryInputs = {
  groupId?: string;
  clientId?: string;
  brokers?: string[];
};

export type KafkaFactoryOverrides = {
  client?: Partial<KafkaConfig>;
  consumer?: Partial<ConsumerConfig>;
  producer?: Partial<ProducerConfig>;
  run?: Partial<ConsumerRunConfig>;
  aws?: AwsIamAuth;
};

export function makeKafkaConfigFactory(
  input: KafkaFactoryInputs = {},
  overrides: KafkaFactoryOverrides = {},
): {
  client: KafkaConfig;
  consumer: ConsumerConfig;
  producer: ProducerConfig;
  run: ConsumerRunConfig;
  asNestMicroserviceOptions: () => MicroserviceOptions;
} {
  const awsEnvEnabled = extractBoolEnv(process.env.KAFKA_AWS_MODE);
  const aws: AwsIamAuth = {
    enabled: overrides.aws?.enabled ?? awsEnvEnabled,
    authorizationIdentity:
      overrides.aws?.authorizationIdentity ??
      extractStrEnvWithFallback(process.env.KAFKA_AUTH_ROLEID, ''),
    accessKeyId:
      overrides.aws?.accessKeyId ??
      extractStrEnvWithFallback(process.env.KAFKA_AUTH_ACCESSKEYID, ''),
    secretAccessKey:
      overrides.aws?.secretAccessKey ??
      extractStrEnvWithFallback(process.env.KAFKA_AUTH_SECRETACCESSKEY, ''),
    ssl: overrides.aws?.ssl ?? true,
  };

  const kafkaRetries = Number.parseInt(
    extractStrEnvWithFallback(process.env.KAFKA_RETRIES, '8'),
    10,
  );

  const baseSasl: SASLOptions | undefined = aws.enabled
    ? {
        mechanism: 'aws',
        authorizationIdentity: aws.authorizationIdentity!,
        accessKeyId: aws.accessKeyId!,
        secretAccessKey: aws.secretAccessKey!,
      }
    : undefined;

  const client: KafkaConfig = {
    brokers: input.brokers ?? [
      `${extractStrEnvWithFallback(process.env.KAFKA_BROKER_HOSTNAME, 'localhost')}:${extractStrEnvWithFallback(process.env.KAFKA_BROKER_PORT, '9092')}`,
    ],
    clientId:
      input.clientId ??
      extractStrEnvWithFallback(process.env.KAFKA_CLIENT_ID, 'order-service'),
    logLevel: logLevel.INFO,
    retry: {
      initialRetryTime: 300,
      factor: 2,
      retries: kafkaRetries,
    },
    ...(aws.enabled ? { ssl: aws.ssl !== false, sasl: baseSasl } : {}),
    ...(overrides.client ?? {}),

  };

  const consumer: ConsumerConfig = {
    groupId:
      input.groupId ??
      extractStrEnvWithFallback(
        process.env.KAFKA_CONSUMER_GROUPID,
        'order-service',
      ),
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    rebalanceTimeout: 60000,
    maxBytesPerPartition: 1 * 1024 * 1024,
    maxBytes: 5 * 1024 * 1024,
    minBytes: 1,
    maxWaitTimeInMs: 100,
    allowAutoTopicCreation: true,
    retry: { retries: kafkaRetries },
    ...(overrides.consumer ?? {}),

  };

  const producer: ProducerConfig = {
    idempotent: true,
    allowAutoTopicCreation: true,
    ...(overrides.producer ?? {}),
  };

  const cpu = Math.max(1, Math.floor(require('os').cpus().length / 2));
  const run: ConsumerRunConfig = {
    autoCommit: false,
    partitionsConsumedConcurrently: cpu,
    eachBatchAutoResolve: true,
    ...(overrides.run ?? {}),
  };

  const asNestMicroserviceOptions = (): MicroserviceOptions => ({
    transport: Transport.KAFKA,
    options: {
      client,
      consumer,
      producer,
      run,
    },
  });

  return { client, consumer, producer, run, asNestMicroserviceOptions };
}
