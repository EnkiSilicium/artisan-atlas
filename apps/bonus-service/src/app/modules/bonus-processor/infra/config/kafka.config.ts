import { makeKafkaConfigFactory } from 'persistence';

import type { KafkaFactoryInputs } from 'persistence';

export const bonusProcessorKafkaFactoryInputs: KafkaFactoryInputs = {
  groupId: 'bonus-processor',
  clientId: 'bonus-processor',
};
export const bonusProcessorKafkaConfig = makeKafkaConfigFactory(
  bonusProcessorKafkaFactoryInputs,
);
