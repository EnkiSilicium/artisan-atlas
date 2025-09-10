import { randomUUID } from 'crypto';

import axios from 'axios';

import { ApiPaths, BonusReadFlatDto, BonusReadPaths, KafkaTopics, OrderCompletedEventV1, OrderPlacedEventV1 } from 'contracts';

import { Kafka } from 'kafkajs';

import { isoNow } from 'shared-kernel';

import type { Producer } from 'kafkajs';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls an async predicate until it resolves to true or the timeout elapses,
 * logging intermittent failures to surface eventual-consistency issues.
 */
async function pollUntil(
  predicate: () => Promise<boolean>,
  {
    timeoutMs = 60_000,
    intervalMs = 400,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  let failures = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return;
    } catch (e: any) {
      failures++;
      if (failures === 1 || failures % 3 === 0) {
        const message = e?.response
          ? `HTTP ${e?.response?.status} ${e?.response?.statusText} body=${JSON.stringify(e?.response?.data)}`
          : e?.code
            ? `${e?.code}: ${e?.message}`
            : e?.message || String(e);

        console.warn(`[E2E] pollUntil error: ${message}`);
      }
      await wait(intervalMs);
    }
    throw new Error('Timed out waiting for condition');
  }
}

describe('Bonus processor integration (Option B)', () => {
  let kafka: Kafka;
  let producer: Producer;
  let readBaseUrl: string;

  beforeAll(async () => {
    const bootstrap = process.env.KAFKA_BOOTSTRAP;
    if (!bootstrap || !bootstrap.includes(':')) {
      throw new Error(
        `KAFKA_BOOTSTRAP is missing or invalid: "${bootstrap ?? ''}". Check global-setup.`,
      );
    }

    readBaseUrl =
      process.env.READ_BASE_URL ??
      axios.defaults.baseURL ??
      'http://127.0.0.1:3002';
    // Make sure read API is up before we proceed
    await pollUntil(
      async () => {
        try {

          await axios.get(
            `${readBaseUrl}/${ApiPaths.Root}/${BonusReadPaths.Root}`,
            { params: { limit: 1, offset: 0 } },
          );


          return true;
        } catch {
          return false;
        }
      },
      { timeoutMs: 60_000, intervalMs: 500 },
    );

    // Kafka client with auto topic creation at produce time
    kafka = new Kafka({
      clientId: 'bonus-e2e',
      brokers: [bootstrap],
    });

    producer = kafka.producer({ allowAutoTopicCreation: true });
    await producer.connect();
  }, 90_000);

  afterAll(async () => {
    try {
      await producer.disconnect();
    } catch {}
  });

  it('processes order events and updates bonus profiles', async () => {
    const commissionerId = randomUUID();
    const orderId = randomUUID();
    const workshopId = randomUUID();
    const eventId = randomUUID();

    // OrderPlaced
    const placed: OrderPlacedEventV1 = {
      eventName: 'OrderPlaced',
      eventId: eventId,
      orderId: orderId,
      aggregateVersion: 1,
      commissionerId: commissionerId,
      selectedWorkshops: [workshopId],
      request: {
        title: 't',
        description: 'd',
        deadline: isoNow(),
        budget: '10',
      },
      schemaV: 1,
      placedAt: isoNow(),
    };

    console.log(
      `[E2E] Sending OrderPlaced for order ${orderId}, commissioner ${commissionerId}`,
    );
    console.log(`[E2E] Event: ${JSON.stringify(placed)}`);

    await producer.send({
      topic: KafkaTopics.OrderTransitions,
      messages: [
        {
          key: Buffer.from(orderId),
          value: JSON.stringify({ ...placed }),
          headers: { 'x-event-name': Buffer.from('OrderPlaced') },
        },
      ],
    });

    // OrderCompleted
    const completed: OrderCompletedEventV1 = {
      eventName: 'OrderCompleted',
      eventId: randomUUID(),
      orderId: orderId,
      commissionerId: commissionerId,
      workshopId: workshopId,
      confirmedAt: isoNow(),
      aggregateVersion: 8,
      schemaV: 1,
    };
    console.log(
      `[E2E] Sending OrderCompleted for order ${orderId}, commissioner ${commissionerId}`,
    );
    console.log(`[E2E] Event: ${JSON.stringify(completed)}`);
    await producer.send({
      topic: KafkaTopics.OrderTransitions,
      messages: [
        {
          key: Buffer.from(orderId),
          value: JSON.stringify(completed),
          headers: { 'x-event-name': Buffer.from('OrderCompleted') },
        },
      ],
    });

    // Brief grace period to let the processor ingest both
    await wait(300);
    // Poll read projection until it shows points > 0
    await pollUntil(
      async () => {
        const refresh = await axios.post(

          `${readBaseUrl}/${ApiPaths.Root}/${BonusReadPaths.Root}/${BonusReadPaths.Refresh}`,

          {
            params: { commissionerId, limit: 1, offset: 0 },
          },
        );
        console.log(
          `[E2E] Read API refresh response: ${JSON.stringify(refresh.data)}`,
        );

        const res = await axios.get(
          `${readBaseUrl}/${ApiPaths.Root}/${BonusReadPaths.Root}`,
          {
            params: { commissionerId, limit: 1, offset: 0 },
          },
        );

        console.log(`[E2E] Read API response: ${JSON.stringify(res.data)}`);
        const total = res.data?.total ?? 0;
        const firstPoints = res.data?.items?.[0]?.totalPoints ?? 0;
        const sussess = total > 0 && firstPoints > 0;
        console.log(
          `[E2E] Commissioner ${commissionerId} has total ${total} profiles, first profile points ${firstPoints}, success=${sussess}`,
        );
        return sussess;
      },
      { timeoutMs: 90_000, intervalMs: 600 },
    );


    const res = await axios.get(
      `${readBaseUrl}/${ApiPaths.Root}/${BonusReadPaths.Root}`,
      {
        params: { commissionerId, limit: 1, offset: 0 },
      },
    );
    {
    }

    console.log(`[E2E] Final Read API response: ${JSON.stringify(res.data)}`);
    expect(res?.data?.total)?.toBeGreaterThan(0);
    expect((res?.data?.items[0] as BonusReadFlatDto).totalPoints).toBeGreaterThan(0);
    expect((res?.data?.items[0] as BonusReadFlatDto)).toBeGreaterThan(0);
  }, 180_000);
});
