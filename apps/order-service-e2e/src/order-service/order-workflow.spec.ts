// apps/order-service/e2e/order.e2e.spec.ts
import { randomUUID } from 'crypto';

import axios from 'axios';
import { Kafka, logLevel } from 'kafkajs';
import { isoNow } from 'shared-kernel';

import {
  AcceptWorkshopInvitationDtoV1,
  ConfirmStageCompletionDtoV1,
  KafkaTopics,
  OrderCancelDtoV1,
  MarkStageCompletionDtoV1,
  ConfirmAcceptedInvitationDtoV1,
  OrderHistoryQueryResultDto,
  OrderHistoryQueryResultFlatDto,
  OrderInitDtoV1,
  ApiPaths,
  OrderInitPaths,
  WorkshopInvitationResponsePaths,
  StageCompletionPaths,
  OrderHistoryPaths,
} from 'contracts';


import type { AxiosResponse } from 'axios';

import type { Consumer } from 'kafkajs';
import { inspect } from 'util';


const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pollUntil(
  predicate: () => Promise<boolean>,
  { timeoutMs = 60_000, intervalMs = 500 } = {},
  timeoutMessage: string = `Default timeout message: Timed out waiting for condition`,
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
          ? `HTTP ${e.response.status} ${e.response.statusText} body=${inspect((e.response.data))}`
          : e?.code
            ? `${e.code}: ${e.message}`
            : e?.message || String(e);

        console.warn(`[E2E] pollUntil error: ${message}`);
      }
    }
    await wait(intervalMs);
  }
  console.error(`[E2E] ${timeoutMessage}`);
  throw new Error(timeoutMessage);
}

const resolveCmd = (): string => {
  const url = process.env.ORDER_BASE_URL;
  if (url?.startsWith('http')) return url.replace(/\/+$/, '');
  return `http://${process.env.ORDER_HOST ?? '127.0.0.1'}:${process.env.ORDER_PORT ?? '3001'}`;
};

const resolveRead = (): string => {
  const url = process.env.ORDER_READ_BASE_URL;
  if (url?.startsWith('http')) return url.replace(/\/+$/, '');
  return `http://${process.env.ORDER_READ_HOST ?? '127.0.0.1'}:${process.env.ORDER_READ_PORT ?? '3002'}`;
};

const bootstrap = (): string => {
  const bs = process.env.KAFKA_BOOTSTRAP;
  if (!bs || !bs.includes(':'))
    throw new Error(`KAFKA_BOOTSTRAP invalid: "${bs ?? ''}"`);
  return bs;
};

async function withConsumer<T>(
  topics: string[],
  each: (p: {
    topic: string;
    key?: string;
    value?: any;
    headers: Record<string, string>;
  }) => void,
  body: () => Promise<T>,
): Promise<T> {
  const kafka = new Kafka({
    clientId: `order-e2e-${Math.random().toString(36).slice(2, 8)}`,
    brokers: [bootstrap()],
    logLevel: logLevel.NOTHING,
  });

  const groupId = `order-e2e-${Date.now()}`;
  const consumer: Consumer = kafka.consumer({ groupId });
  console.log(
    `[E2E][Kafka] connect groupId=${groupId} topics=[${topics.join(', ')}]`,
  );
  await consumer.connect();
  for (const t of topics)
    await consumer.subscribe({ topic: t, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const key = message.key?.toString('utf8');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(message.headers ?? {})) {
        headers[k] = Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
      }
      let value: any;
      try {
        value = JSON.parse(message.value?.toString('utf8') ?? 'null');
      } catch {
        value = undefined;
      }
      const evName = headers['x-event-name'];
      const evOrderId = value?.orderId ?? value?.orderId;
      console.log(
        `[E2E][Kafka] ${topic} name=${evName ?? '-'} orderId=${evOrderId ?? '-'}`,
      );
      each({ topic, key, value, headers });
    },
  });

  try {
    const res = await body();
    await wait(250);
    return res;
  } catch (error) {
    if (axios.isAxiosError(error) || error?.isAxiosError === true) {
      const { response, code, message, status } = error;
      console.error(
        `[E2E] AxiosError${code ? `: ${code}` : ''} -> ${status ?? response?.status} (${message})\n${inspect((response?.data))}`,
      );
    }
    throw error;
  } finally {
    await consumer.stop().catch(() => {});
    await consumer.disconnect().catch(() => {});
  }
}

async function readStages(
  READ: string,
  commissionerId: string,
): Promise<OrderHistoryQueryResultDto> {

  const urlRefresh = `${READ}/${ApiPaths.Root}/${OrderHistoryPaths.Root}/${OrderHistoryPaths.Stages}/${OrderHistoryPaths.Refresh}`;

  console.log(`[E2E][HTTP] POST ${urlRefresh}`);
  const resRefresh = await axios.post(urlRefresh, {}, { timeout: 2500 });
  console.log(`[E2E][HTTP] <- ${resRefresh.status} from ${urlRefresh}`);

  const urlRead = `${READ}/${ApiPaths.Root}/${OrderHistoryPaths.Root}/${OrderHistoryPaths.Stages}`;
  console.log(
    `[E2E][HTTP] GET ${urlRead}?commissionerId=${commissionerId}&limit=10&offset=0`,
  );
  const res = await axios.get(urlRead, {
    params: { commissionerId, limit: 10, offset: 0 },
    timeout: 2500,
  });
  console.log(`[E2E][HTTP] <- ${res.status} from ${urlRead}`);
  console.log(`[E2E][HTTP] data=${inspect(inspect((res.data)))}`);
  return res.data;
}

describe('Order workflow integration (read model + Kafka)', () => {
  let CMD: string;
  let READ: string;

  beforeAll(async () => {
    CMD = resolveCmd();
    READ = resolveRead();
    console.log(`[E2E] CMD_BASE=${CMD}`);
    console.log(`[E2E] READ_BASE=${READ}`);

    //console.log(`[E2E][HTTP] GET ${CMD}/${ApiPaths.Root}/health (or /)`);
    //await pollUntil(async () => (await axios.get(`${CMD}/${ApiPaths.Root}/health`).catch(() => axios.get(`${CMD}/`))).status < 500);

    console.log(`[E2E] Waiting for read model to be ready...`);
    const readStagesUrl = `${READ}/${ApiPaths.Root}/${OrderHistoryPaths.Root}/${OrderHistoryPaths.Stages}`;
    console.log(`[E2E][HTTP] GET ${readStagesUrl}?limit=1&offset=0`);
    await pollUntil(
      async () =>
        (
          await axios.get(readStagesUrl, {
            params: { limit: 1, offset: 0 },
          })
        ).status === 200,
    );
    console.log(`[E2E] Read model is ready -> confirmed`);
  }, 90_000);

  it('decline-all: emits Kafka signals; read model reflects decline', async () => {
    console.log(`[E2E] Starting decline-all test...`);
    const commissionerId = randomUUID();
    const workshops = [randomUUID(), randomUUID()];

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [
        String(KafkaTopics.AllResponsesReceived),
        String(KafkaTopics.AllInvitationsDeclined),
        String(KafkaTopics.StageTransitions),
      ],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        console.log(
          `[E2E] commissionerId=${commissionerId} workshops=${workshops.join(',')}`,
        );

        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;
        console.log(`[E2E] Running order creation...`);
        console.log(`[E2E][HTTP] POST ${postOrderUrl}`);
        const response: AxiosResponse = await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: workshops,
          request: {
            title: 'req',
            description: 'desc',
            deadline: isoNow(),
            budget: '10',
          },
        } satisfies OrderInitDtoV1);
        console.log(
          `[E2E] order init response: ${response.status} ${inspect((response.data))}`,
        );

        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          return d.items[0].orderId;
        });
        console.log(`[E2E] Order retrieved: ${orderId}`);

        for (const ws of workshops) {
          console.log(`[E2E] Declining invitation for workshop ${ws}...`);
          const url = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Decline}`;
          console.log(
            `[E2E][HTTP] POST ${url} orderId=${orderId} workshopId=${ws}`,
          );
          await axios.post(url, { orderId, workshopId: ws });
          console.log(`[E2E] Declining SUCCESS`);
        }

        console.log(`[E2E] polling for events...`);
        await pollUntil(
          async () =>
            seen.has('AllResponsesReceived') &&
            seen.has('AllInvitationsDeclined'),
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for AllResponsesReceived + AllInvitationsDeclined events for order ${orderId}`,
        );
      },
    );

    console.log(`[E2E] verifying results of decline-all...`);

    expect(seen.has('AllResponsesReceived')).toBe(true);
    expect(seen.has('AllInvitationsDeclined')).toBe(true);

    const after = await readStages(READ, commissionerId);
    expect(after.total).toBeGreaterThan(0);
  }, 150_000);

  it('accept-and-complete: emits stage transitions & completion; read model reflects', async () => {
    console.log(`[E2E] Starting accept-and-complete test...`);

    const commissionerId = randomUUID();
    const workshops = [randomUUID(), randomUUID()];

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [
        String(KafkaTopics.AllResponsesReceived),
        String(KafkaTopics.StageTransitions),
        String(KafkaTopics.StageTransitions),
      ],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;
        console.log(
          `[E2E] commissionerId=${commissionerId} workshops=${workshops.join(',')}`,
        );
        console.log(`[E2E][HTTP] POST ${postOrderUrl}`);

        console.log(`[E2E] Creating order...`);
        await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: workshops,
          request: {
            title: 'req',
            description: 'desc',
            deadline: isoNow(),
            budget: '10',
          },
        } satisfies OrderInitDtoV1);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          console.log(`[E2E][HTTP] final readStages <- ${inspect((d))}`);
          return d.items[0].orderId;
        });
        console.log(`[E2E] Order retrieved: ${orderId}`);

        const acceptUrl = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Accept}`;
        console.log(
          `[E2E][HTTP] POST ${acceptUrl} orderId=${orderId} workshopId=${workshops[0]}`,
        );

        console.log(
          `[E2E] Accepting invitation for workshop ${workshops[0]}...`,
        );
        await axios.post(acceptUrl, {
          orderId,
          workshopId: workshops[0],
          invitationInfo: {
            description: 'desc',
            deadline: isoNow(),
            budget: '10 USD',
          },
          stages: [
            {
              stageName: 'Design',
              stageOrder: 0,
              approximateLength: '1d',
              description: 'd',
              needsConfirmation: false,
            },
            {
              stageName: 'Build',
              stageOrder: 1,
              approximateLength: '1d',
              description: 'b',
              needsConfirmation: true,
            },
            {
              stageName: 'Deliver',
              stageOrder: 2,
              approximateLength: '1d',
              description: 'c',
              needsConfirmation: false,
            },
          ],
        } satisfies AcceptWorkshopInvitationDtoV1);

        console.log(`[E2E] Declining invitation for the other workshop...`);
        const declineUrl = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Decline}`;
        console.log(
          `[E2E][HTTP] POST ${declineUrl} orderId=${orderId} workshopId=${workshops[1]}`,
        );
        await axios.post(declineUrl, { orderId, workshopId: workshops[1] });

        console.log(`[E2E] Catching events...`);
        await pollUntil(
          async () => seen.has('AllResponsesReceived'),
          {
            timeoutMs: 60_000,
            intervalMs: 400,
          },
          `Timed out waiting for AllResponsesReceived event for order ${orderId}`,
        );

        const confirmInvitationUrl = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Confirm}`;
        console.log(
          `[E2E][HTTP] POST ${confirmInvitationUrl} orderId=${orderId} workshopId=${workshops[0]}`,
        );
        await axios.post(
          confirmInvitationUrl,
          { orderId, workshopId: workshops[0] } satisfies ConfirmAcceptedInvitationDtoV1,
        );

        console.log(`[E2E] Marking & confirming stages...`);
        const mark = (stage: string) =>
          axios.post(
            `${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Mark}`,
            {
              orderId,
              workshopId: workshops[0],
              commissionerId,
              stageName: stage,
            } satisfies MarkStageCompletionDtoV1,
          );
        const confirm = (stage: string) =>

        axios.post(
            `${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Confirm}`,
            {
              orderId,
              workshopId: workshops[0],
              commissionerId,
              stageName: stage,
            } satisfies ConfirmStageCompletionDtoV1,
          );


        console.log(
          `[E2E][HTTP] POST ${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Mark} Design`,
        );
        await mark('Design');
        console.log(`Design marked (autoconfirm expected)`);

        console.log(
          `[E2E][HTTP] POST ${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Mark} Build`,
        );
        await mark('Build');
        console.log(`Build marked`);

        console.log(
          `[E2E][HTTP] POST ${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Confirm} Build`,
        );
        await confirm('Build');
        console.log(`Build confirmed`);

        console.log(
          `[E2E][HTTP] POST ${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Mark} Deliver`,
        );
        await mark('Deliver');
        console.log(`Deliver marked (autoconfirm expected)`);
        console.log(`All stages marked (and Build confirmed)`);

        console.log(`[E2E] Waiting for AllStagesCompleted...`);
        console.log(`[E2E] Catching events...`);
        await pollUntil(
          async () => seen.has('AllStagesCompleted'),
          {
            timeoutMs: 90_000,
            intervalMs: 500,
          },
          `Timed out waiting for AllStagesCompleted event for order ${orderId}`,
        );

        console.log(`[E2E] AllStagesCompleted received`);
      },
    );

    console.log(`[E2E] verifying results of accept-and-complete...`);
    expect(seen.has('AllResponsesReceived')).toBe(true);
    expect(seen.has('StageConfirmationMarked')).toBe(true);
    expect(seen.has('AllStagesCompleted')).toBe(true);
    const final = await readStages(READ, commissionerId);
    expect(final.total).toBeGreaterThan(0);
  }, 180_000);

  it('cancel-before-accept: emits OrderCancelled; read model reflects cancellation', async () => {
    console.log(`[E2E] Starting cancel-before-accept test...`);
    const commissionerId = randomUUID();
    const workshops = [randomUUID(), randomUUID()];

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [String(KafkaTopics.OrderTransitions)],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;
        console.log(`[E2E] Running order creation...`);
        await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: workshops,
          request: {
            title: 'cancel',
            description: 'cancel-before-accept',
            deadline: isoNow(),
            budget: '1',
          },
        } satisfies OrderInitDtoV1);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          return d.items[0].orderId;
        });
        console.log(`[E2E] Order retrieved: ${orderId}`);

        const cancelUrl = `${CMD}/${ApiPaths.Root}/order/cancel`;
        console.log(`[E2E][HTTP] POST ${cancelUrl} orderId=${orderId}`);
        await axios.post(cancelUrl, {
          orderId,
          cancelledBy: 'commissioner',
          reason: 'test',
        } satisfies OrderCancelDtoV1);

        console.log(`[E2E] Waiting for OrderCancelled event...`);
        await pollUntil(
          async () => seen.has('OrderCancelled'),
          {
            timeoutMs: 60_000,
            intervalMs: 400,
          },
          `Timed out waiting for OrderCancelled event for order ${orderId}`,
        );

        console.log(`[E2E] Waiting for read model to reflect cancellation...`);
        await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return d.items[0]?.orderState === 'Cancelled';
          },
          {
            timeoutMs: 60_000,
            intervalMs: 400,
          },
          `Timed out waiting for read model cancellation for order ${orderId}`,
        );
      },
    );

    console.log(`[E2E] verifying results of cancel-before-accept...`);
    expect(seen.has('OrderCancelled')).toBe(true);
    const after = await readStages(READ, commissionerId);
    expect(after.items[0]?.orderState).toBe('Cancelled');
    expect(after.items[0]?.isTerminated).toBe(true);
  }, 120_000);

  // --------- Non-happy paths ---------

  it('non-happy: decline not-invited workshop → 4xx; no Kafka; read model unchanged', async () => {
    console.log(`[E2E] Starting decline-not-invited test...`);
    const commissionerId = randomUUID();
    const invited = [randomUUID(), randomUUID()];
    const notInvited = randomUUID();

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [
        String(KafkaTopics.StageTransitions),
        String(KafkaTopics.AllResponsesReceived),
        String(KafkaTopics.AllInvitationsDeclined),
        String(KafkaTopics.StageTransitions),
      ],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;

        console.log(`[E2E] Running order creation...`);
        console.log(
          `[E2E] commissionerId=${commissionerId} invited=${invited.join(',')}`,
        );
        console.log(`[E2E][HTTP] POST ${postOrderUrl}`);
        await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: invited,
          request: {
            title: 'bad',
            description: 'decline-not-invited',
            deadline: isoNow(),
            budget: '1',
          },
        } satisfies OrderInitDtoV1);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          console.log(`[E2E][HTTP] final readStages <- ${inspect((d))}`);
          return d.items[0].orderId;
        });

        const before = await readStages(READ, commissionerId);

        let status = 0;
        try {
          console.log(
            `[E2E] Declining the one to whom it shall not concern...`,
          );

          const url = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Decline}`;

          console.log(
            `[E2E][HTTP] POST ${url} orderId=${orderId} workshopId=${notInvited}`,
          );
          await axios.post(url, { orderId, workshopId: notInvited });
        } catch (e: any) {
          console.log(`[E2E] Caught expected error: ${e?.message ?? e}`);
          console.log(
            `[E2E] Yeah, screw off, ${notInvited}, ain't your damn business!`,
          );

          status = e?.response?.status ?? 0;
        }
        expect(status).toBeGreaterThanOrEqual(400);

        await wait(800);
        expect(seen.size).toBe(0);

        console.log(`[E2E] Verifying read model unchanged...`);
        const after = await readStages(READ, commissionerId);
        expect(after.total).toBeGreaterThanOrEqual(before.total ?? 0);
      },
    );
  }, 90_000);

  it('non-happy: mark stage before acceptance → 4xx; no StageTransitions; read model unchanged', async () => {
    console.log(`[E2E] Starting mark-before-accept test...`);
    const commissionerId = randomUUID();
    const workshops = [randomUUID(), randomUUID()];

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [
        String(KafkaTopics.StageTransitions),
        String(KafkaTopics.StageTransitions),
      ],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;
        console.log(`[E2E] Running order creation...`);
        console.log(
          `[E2E] commissionerId=${commissionerId} workshops=${workshops.join(',')}`,
        );
        console.log(`[E2E][HTTP] POST ${postOrderUrl}`);
        await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: workshops,
          request: {
            title: 'bad',
            description: 'mark-before-accept',
            deadline: isoNow(),
            budget: '1',
          },
        } satisfies OrderInitDtoV1);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          console.log(`[E2E][HTTP] final readStages <- ${inspect((d))}`);
          return d.items[0].orderId;
        });

        const before = await readStages(READ, commissionerId);

        let status = 0;
        try {
          console.log(`[E2E] Marking stage before acceptance...`);
          const url = `${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Mark}`;
          console.log(`[E2E][HTTP] POST ${url} (pre-accept)`);
          await axios.post(url, {
            orderId,
            workshopId: workshops[0],
            commissionerId,
            stageName: 'Design',
          } satisfies MarkStageCompletionDtoV1);
        } catch (e: any) {
          console.log(`[E2E] Caught expected error: ${e?.message ?? e}`);
          console.log(`[E2E] the hell is wrong with you, ${workshops[0]}?`);
          status = e?.response?.status ?? 0;
        }
        expect(status).toBeGreaterThanOrEqual(400);

        await wait(600);
        expect(seen.size).toBe(0);

        console.log(`[E2E] Verifying read model unchanged...`);
        const after = await readStages(READ, commissionerId);
        expect(after.total).toBeGreaterThanOrEqual(before.total ?? 0);
      },
    );
  }, 90_000);

  it('non-happy: confirm stage before mark or when not required → 4xx; no completion; read model not completed', async () => {
    console.log(`[E2E] Starting confirm-before-mark test...`);
    const commissionerId = randomUUID();
    const workshops = [randomUUID(), randomUUID()];

    const seen = new Set<string>();
    let orderId!: string;

    await withConsumer(
      [
        String(KafkaTopics.StageTransitions),
        String(KafkaTopics.StageTransitions),
      ],
      ({ headers, value }) => {
        const name = headers['x-event-name'];
        const vOrderId = value?.orderId ?? value?.orderId;
        if (name && vOrderId && vOrderId === orderId) seen.add(name);
      },
      async () => {
        const postOrderUrl = `${CMD}/${ApiPaths.Root}/${OrderInitPaths.Root}`;
        console.log(
          `[E2E] commissionerId=${commissionerId} workshops=${workshops.join(',')}`,
        );
        console.log(`[E2E][HTTP] POST ${postOrderUrl}`);
        await axios.post(postOrderUrl, {
          commissionerId,
          selectedWorkshops: workshops,
          request: {
            title: 'bad',
            description: 'confirm-before-mark',
            deadline: isoNow(),
            budget: '1',
          },
        } satisfies OrderInitDtoV1);

        orderId = await pollUntil(
          async () => {
            const d = await readStages(READ, commissionerId);
            return Boolean(d?.items?.[0]?.orderId);
          },
          {
            timeoutMs: 90_000,
            intervalMs: 400,
          },
          `Timed out waiting for order to appear in read model for commissioner ${commissionerId}`,
        ).then(async () => {
          const d = await readStages(READ, commissionerId);
          return d.items[0].orderId;
        });

        console.log(
          `[E2E] Accepting invitation for workshop ${workshops[0]}...`,
        );

        const acceptUrl = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Accept}`;

        console.log(
          `[E2E][HTTP] POST ${acceptUrl} orderId=${orderId} workshopId=${workshops[0]} (needsConfirmation for Build)`,
        );
        await axios.post(acceptUrl, {
          orderId,
          workshopId: workshops[0],
          invitationInfo: {
            description: 'desc',
            deadline: isoNow(),
            budget: '10 USD',
          },
          stages: [
            {
              stageName: 'Design',
              stageOrder: 0,
              approximateLength: '1d',
              description: 'd',
              needsConfirmation: false,
            },
            {
              stageName: 'Build',
              stageOrder: 1,
              approximateLength: '1d',
              description: 'b',
              needsConfirmation: true,
            },
          ],
        } satisfies AcceptWorkshopInvitationDtoV1);

        const confirmInvitationUrl = `${CMD}/${ApiPaths.Root}/${WorkshopInvitationResponsePaths.Root}/${WorkshopInvitationResponsePaths.Confirm}`;
        console.log(
          `[E2E][HTTP] POST ${confirmInvitationUrl} orderId=${orderId} workshopId=${workshops[0]}`,
        );
        await axios.post(
          confirmInvitationUrl,
          { orderId, workshopId: workshops[0] } satisfies ConfirmAcceptedInvitationDtoV1,
        );

        const before = await readStages(READ, commissionerId);

        // confirm Design (no confirmation needed)
        let status1 = 0;
        try {
          console.log(`[E2E] Confirming Design (no confirmation needed)...`);
          const url1 = `${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Confirm}`;
          console.log(`[E2E][HTTP] POST ${url1} (Design no-confirm-required)`);
          await axios.post(url1, {
            orderId,
            workshopId: workshops[0],
            commissionerId,
            stageName: 'Design',
          } satisfies ConfirmStageCompletionDtoV1);
        } catch (e: any) {
          console.log(`[E2E] Caught expected error: ${e?.message ?? e}`);
          console.log(`[E2E] Impertinent fool, ${workshops[0]}!`);
          console.log();

          status1 = e?.response?.status ?? 0;
        }
        expect(status1).toBeGreaterThanOrEqual(400);

        let status2 = 0;
        try {
          console.log(`[E2E] Confirming Build (before marking)...`);
          const url2 = `${CMD}/${ApiPaths.Root}/${StageCompletionPaths.Root}/${StageCompletionPaths.Confirm}`;
          console.log(`[E2E][HTTP] POST ${url2} (Build before mark)`);
          await axios.post(url2, {
            orderId,
            workshopId: workshops[0],
            commissionerId,
            stageName: 'Build',
          } satisfies ConfirmStageCompletionDtoV1);
        } catch (e: any) {
          console.log(`[E2E] Caught expected error: ${e?.message ?? e}`);
          console.log(`[E2E] Asinine wretch, ${workshops[0]}!`);
          status2 = e?.response?.status ?? 0;
        }
        expect(status2).toBeGreaterThanOrEqual(400);

        console.log(`[E2E] Verifying no completion occurred...`);
        await wait(800);
        expect(seen.has('AllStagesCompleted')).toBe(false);

        const after = await readStages(READ, commissionerId);
        expect(after.total).toBeGreaterThanOrEqual(before.total ?? 0);
      },
    );
  }, 120_000);

  console.log(`[E2E] HAIL SATAN 666`);
});
