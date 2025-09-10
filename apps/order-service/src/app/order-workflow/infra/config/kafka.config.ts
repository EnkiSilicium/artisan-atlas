import { makeKafkaConfigFactory } from 'persistence';

import type { KafkaFactoryInputs } from 'persistence';

export const orderKafkaFactoryInputs: KafkaFactoryInputs = {
  groupId: 'order-workflow',
  clientId: 'order-workflow',
};
export const orderWorkflowKafkaConfig = makeKafkaConfigFactory(
  orderKafkaFactoryInputs,
);
