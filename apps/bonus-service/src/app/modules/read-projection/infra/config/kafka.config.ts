import { makeKafkaConfigFactory } from 'persistence';

import type { KafkaFactoryInputs } from 'persistence';

export const bonusReadKafkaFactoryInputs: KafkaFactoryInputs = {
  groupId: 'bonus-read',
  clientId: 'bonus-read',
};
export const bonusReadKafkaConfig = makeKafkaConfigFactory(
  bonusReadKafkaFactoryInputs,
);
