import { randomUUID } from 'crypto';

import { isoNow } from 'shared-kernel';

import { WorkshopInvitation } from './workshop-invitation.entity';
import { WorkshopInvitationStatus } from './workshop-invitation.enum';

export function makeWorkshopInvitation(
  over: Partial<WorkshopInvitation> = {},
): WorkshopInvitation {
  const status = over.status ?? WorkshopInvitationStatus.Pending;
  const w = Object.create(WorkshopInvitation.prototype) as WorkshopInvitation;
  Object.assign(w, {
    orderId: randomUUID(),
    workshopId: randomUUID(),
    status,
    description:
      status === WorkshopInvitationStatus.Accepted ||
      status === WorkshopInvitationStatus.Confirmed
        ? 'd'
        : null,
    deadline:
      status === WorkshopInvitationStatus.Accepted ||
      status === WorkshopInvitationStatus.Confirmed
        ? isoNow()
        : null,
    budget:
      status === WorkshopInvitationStatus.Accepted ||
      status === WorkshopInvitationStatus.Confirmed
        ? '100'
        : null,
    createdAt: isoNow(),
    lastUpdatedAt: isoNow(),
    version: 1,
    ...over,
  });
  return w;
}
