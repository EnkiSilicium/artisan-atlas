import { Panic } from 'error-handling/error-core';
import { PanicRegistry } from 'error-handling/registries/common';

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
    throw new Panic({
      errorObject: PanicRegistry.byCode.BUG,
      details: {
        message: `No topic mapping for eventName="${eventName}". Known: [${knownList}]`,
      },
    });
  }
}
