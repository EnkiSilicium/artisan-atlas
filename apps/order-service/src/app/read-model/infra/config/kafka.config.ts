import { makeKafkaConfigFactory } from 'persistence';

import type { KafkaFactoryInputs } from 'persistence';

const orderKafkaFactoryInputs: KafkaFactoryInputs = {
  groupId: 'order-read',
  clientId: 'order-read',
};
export const orderReadKafkaConfig = makeKafkaConfigFactory(
  orderKafkaFactoryInputs,
);
