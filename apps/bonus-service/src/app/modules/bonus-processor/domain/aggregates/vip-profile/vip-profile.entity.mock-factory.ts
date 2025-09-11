/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { randomUUID } from 'crypto';

import { isoNow } from 'shared-kernel';

import { LastMonthEventSet } from './last-month-event-set.entity';
import { VipProfile } from './vip-profile.entity';

export function makeVipProfile(over: Partial<VipProfile> = {}): VipProfile {
  const vp = Object.create(VipProfile.prototype) as VipProfile;
  Object.assign(vp, {
    commissionerId: over.commissionerId ?? randomUUID(),
    lastPeriodPoints: over.lastPeriodPoints ?? 0,
    isVIP: over.isVIP ?? false,
    lastTickAt: over.lastTickAt ?? isoNow(),
    lastBucket: over.lastBucket ?? 0,
    vipPolicyVersion: over.vipPolicyVersion ?? 1,
    windowAlgoPolicyVersion: over.windowAlgoPolicyVersion ?? 1,
    bonusPolicyVersion: over.bonusPolicyVersion ?? 1,
    createdAt: over.createdAt ?? isoNow(),
    lastUpdatedAt: over.lastUpdatedAt ?? isoNow(),
    version: over.version ?? 1,
    lastMonthEvents: over.lastMonthEvents ?? [],
    ...over,
  });
  return vp;
}

export function makeLMEvent(
  over: Partial<LastMonthEventSet> & { commissionerId?: string } = {},
): LastMonthEventSet {
  const ev = Object.create(LastMonthEventSet.prototype) as LastMonthEventSet;
  Object.assign(ev, {
    eventId: over.eventId ?? randomUUID(),
    commissionerId: over.commissionerId ?? randomUUID(),
    eventName: over.eventName ?? ('OrderCompleted' as any),
    bucket: over.bucket ?? 0,
    createdAt: over.createdAt ?? isoNow(),
    lastUpdatedAt: over.lastUpdatedAt ?? isoNow(),
    version: over.version ?? 1,
    ...over,
  });
  return ev;
}
