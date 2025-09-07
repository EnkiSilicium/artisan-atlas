import { ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import type { BaseEvent } from 'contracts';


export function assertsCanBeBonusEvent(
  event: Record<string, unknown>,
): asserts event is BaseEvent<string> & { commissionerId: string } & Record<string, unknown> {

  const eventName = event['eventName']
  const commissionerId = event['commissionerId']

  if (!eventName) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { description: `injested event does not have eventName` },
    });
  }

  if (!commissionerId) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: {
        description: `injested event named [${eventName}] does not have commissionerId`,
      },
    });
  }
}
