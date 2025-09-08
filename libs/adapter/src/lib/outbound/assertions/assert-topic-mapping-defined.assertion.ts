import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';

interface AssertTopicMappingDefinedParams {
  topic: unknown;
  eventName: string;
  known: string[];
}

export function assertTopicMappingDefined({
  topic,
  eventName,
  known,
}: AssertTopicMappingDefinedParams): void {
  if (!topic) {
    const knownList = known.join(', ');
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        message: `No topic mapping for eventName="${eventName}". Known: [${knownList}]`,
      },
    });
  }
}
