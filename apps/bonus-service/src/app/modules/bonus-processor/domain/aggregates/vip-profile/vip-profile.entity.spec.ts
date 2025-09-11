/* eslint-disable */
import 'reflect-metadata';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import {
  makeVipProfile,
  makeLMEvent,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity.mock-factory';
import { WindowAlgoRegistry } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/window-algo.registry';

import type {
  BonusEventName,
  BonusEventRegistryInterface,
  EventBonusInfo,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import type { VipProfileRegistryInterface } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.registry';
import type { WindowAlgoRegistryInterface } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/window-algo.registry';

// ---------------- helpers ----------------
const uuid = (n = 1) =>
  `${String(n).padStart(8, '0')}-1111-4111-8111-11111111111${n}`;

// Base policy instances
const baseWindowAlgoRegistry: WindowAlgoRegistryInterface = WindowAlgoRegistry;
const baseVipPolicy: VipProfileRegistryInterface = {
  policyName: 'VipProfileRegistry',
  vipThreshold: 1000,
  version: 1,
};
const baseBonusPolicy: BonusEventRegistryInterface = {
  policyName: 'BonusEventRegistry',
  version: 1,
  registry: {} as Record<BonusEventName, EventBonusInfo>,
};

// Overlay helpers (non-mutating)
const mkWindow = (over: Partial<WindowAlgoRegistryInterface>) => ({
  ...baseWindowAlgoRegistry,
  ...over,
});

const mkVip = (over: Partial<VipProfileRegistryInterface>) => ({
  ...baseVipPolicy,
  ...over,
});

const mkBonus = (
  over: Partial<BonusEventRegistryInterface>,
): BonusEventRegistryInterface => ({
  ...baseBonusPolicy,
  ...over,
});

describe('VipProfile', () => {
  describe('constructor`s invariants', () => {
    it('throws on non-UUID commissionerId', () => {
      const badId = 'not-a-uuid';
      expect(
        () =>
          new VipProfile({
            commissionerId: badId,
            windowAlgoRegistry: baseWindowAlgoRegistry,
            vipProfileRegistry: baseVipPolicy,
            bonusRegistry: baseBonusPolicy,
          }),
      ).toThrow();
    });

    describe('processBonusEvent', () => {
      const skipValidation = true;

      it('throws if input policies are version-mismatched', () => {
        const profile = new VipProfile(
          {
            commissionerId: uuid(1),
            windowAlgoRegistry: baseWindowAlgoRegistry,
            vipProfileRegistry: baseVipPolicy,
            bonusRegistry: baseBonusPolicy,
          },
          skipValidation,
        );
        const event = {
          commissionerId: profile.commissionerId,
          eventName: 'bronze' as any,
          eventId: uuid(2),
        };

        const wrongWindowPolicy = mkWindow({ version: 2 });
        const wrongVipPolicy = mkVip({ version: 2 });
        const wrongBonusPolicy = mkBonus({ version: 2 });

        expect(() =>
          profile.processBonusEvent(
            event,
            wrongWindowPolicy,
            baseVipPolicy as any,
            baseBonusPolicy,
            skipValidation,
          ),
        ).toThrow();
        expect(() =>
          profile.processBonusEvent(
            event,
            baseWindowAlgoRegistry,
            wrongVipPolicy as any,
            baseBonusPolicy,
            skipValidation,
          ),
        ).toThrow();
        expect(() =>
          profile.processBonusEvent(
            event,
            baseWindowAlgoRegistry,
            baseVipPolicy as any,
            wrongBonusPolicy,
            skipValidation,
          ),
        ).toThrow();
      });

      it('places the event in a correct bucket', () => {
        const profile1 = makeVipProfile({
          commissionerId: uuid(2),
          lastBucket: 0,
          isVIP: false,
        });
        const profile2 = makeVipProfile({
          commissionerId: uuid(2),
          lastBucket: 4,
        });

        const eventName = 'bronze' as any;
        const bonusRegistry = mkBonus({
          version: 1,
          registry: { [eventName]: { bonusAmount: 20 } } as any,
        });
        const event = {
          commissionerId: profile1.commissionerId,
          eventName: 'bronze' as any,
          eventId: uuid(2),
        };

        profile1.processBonusEvent(
          event,
          baseWindowAlgoRegistry,
          baseVipPolicy as any,
          bonusRegistry,
          skipValidation,
        );
        profile2.processBonusEvent(
          event,
          baseWindowAlgoRegistry,
          baseVipPolicy as any,
          bonusRegistry,
          skipValidation,
        );

        expect(profile1.lastMonthEvents[0].bucket).toBe(
          baseWindowAlgoRegistry.amountOfBuckets - 1,
        );

        expect(profile2.lastMonthEvents[0].bucket).toBe(3);
      });

      it('throws if event is not in the bonus event registry', () => {
        const profile = new VipProfile(
          {
            commissionerId: uuid(1),
            windowAlgoRegistry: baseWindowAlgoRegistry,
            vipProfileRegistry: baseVipPolicy,
            bonusRegistry: mkBonus({}), // empty registry copy
          },
          true,
        );
        const event = {
          commissionerId: profile.commissionerId,
          eventName: 'nonexistent_event' as any,
          eventId: uuid(2),
        };
        expect(() =>
          profile.processBonusEvent(
            event,
            baseWindowAlgoRegistry,
            baseVipPolicy as any,
            mkBonus({}),
            skipValidation,
          ),
        ).toThrow();
      });

      it('correctly detects VIP threshold cross (vip gained)', () => {
        const initialPoints = 990;
        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastPeriodPoints: initialPoints,
          isVIP: false,
        });

        const eventName = 'bronze' as any;
        const bonusRegistry = mkBonus({
          version: 1,
          registry: { [eventName]: { bonusAmount: 20 } } as any,
        });
        const event = {
          commissionerId: profile.commissionerId,
          eventName,
          eventId: uuid(2),
        };

        const result = profile.processBonusEvent(
          event,
          baseWindowAlgoRegistry,
          baseVipPolicy as any,
          bonusRegistry,
          skipValidation,
        );

        expect(result.vipGained).toBe(true);
        expect(profile.isVIP).toBe(true);
        expect(profile.lastPeriodPoints).toBe(initialPoints + 20);
      });

      it('correctly increments the total', () => {
        const profile = makeVipProfile({
          commissionerId: uuid(2),
          lastPeriodPoints: 100,
          isVIP: false,
        });

        const eventName = 'coin' as any;
        const bonusRegistry = mkBonus({
          version: 1,
          registry: { [eventName]: { bonusAmount: 50 } } as any,
        });
        const event = {
          commissionerId: profile.commissionerId,
          eventName,
          eventId: uuid(3),
        };

        profile.processBonusEvent(
          event,
          baseWindowAlgoRegistry,
          baseVipPolicy as any,
          bonusRegistry,
          skipValidation,
        );

        expect(profile.lastPeriodPoints).toBe(150);
        expect(profile.lastMonthEvents).toHaveLength(1);
        const addedEvent = profile.lastMonthEvents[0];
        expect(addedEvent.eventId).toBe(event.eventId);
        expect(addedEvent.eventName).toBe(eventName);
      });
    });

    describe('evictStaleEvents', () => {
      it('throws if input policies are version-mismatched', () => {
        const profile = new VipProfile(
          {
            commissionerId: uuid(1),
            windowAlgoRegistry: baseWindowAlgoRegistry,
            vipProfileRegistry: baseVipPolicy,
            bonusRegistry: baseBonusPolicy,
          },
          true,
        );

        const wrongWindowPolicy = mkWindow({ version: 2 });
        const wrongVipPolicy = mkVip({ version: 2 });
        const wrongBonusPolicy = mkBonus({ version: 2 });

        expect(() =>
          profile.evictStaleEvents(
            wrongWindowPolicy,
            baseBonusPolicy,
            baseVipPolicy as any,
          ),
        ).toThrow();
        expect(() =>
          profile.evictStaleEvents(
            baseWindowAlgoRegistry,
            baseBonusPolicy,
            wrongVipPolicy as any,
          ),
        ).toThrow();
        expect(() =>
          profile.evictStaleEvents(
            baseWindowAlgoRegistry,
            wrongBonusPolicy,
            baseVipPolicy as any,
          ),
        ).toThrow();
      });

      it('evicts events in the next bucket', () => {
        const lastBucket = 5;
        const oneMinuteAgo = new Date(Date.now() - 61 * 1000).toISOString();

        const evictEvent = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName: 'bronze' as any,
          bucket: (lastBucket + 1) % baseWindowAlgoRegistry.amountOfBuckets,
        });
        const keepEvent = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(3),
          eventName: 'silver' as any,
          bucket: (lastBucket + 2) % baseWindowAlgoRegistry.amountOfBuckets,
        });

        const initialPoints = 20 + 30;
        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastBucket,
          lastTickAt: oneMinuteAgo,
          lastMonthEvents: [evictEvent, keepEvent],
          lastPeriodPoints: initialPoints,
          isVIP: false,
        });

        const bonusRegistry = mkBonus({
          version: 1,
          registry: {
            ['bronze']: { bonusAmount: 20 },
            ['silver']: { bonusAmount: 30 },
          } as any,
        });

        const result = profile.evictStaleEvents(
          baseWindowAlgoRegistry,
          bonusRegistry,
          baseVipPolicy as any,
        );

        expect(result.amountOfEventsEvicted).toBe(1);
        expect(result.evicted).toContain(evictEvent.eventId);
        expect(result.evicted).not.toContain(keepEvent.eventId);
        expect(profile.lastMonthEvents).toHaveLength(1);
        expect(profile.lastMonthEvents[0].eventId).toBe(keepEvent.eventId);
        expect(profile.lastPeriodPoints).toBe(initialPoints - 20);
      });

      it('returns IDs of the evicted events in "evicted" object property', () => {
        const lastBucket = 0;
        const pastTime = new Date(Date.now() - 61 * 1000).toISOString();

        const staleEvent = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName: 'stale' as any,
          bucket: (lastBucket + 1) % baseWindowAlgoRegistry.amountOfBuckets,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(3),
          lastBucket,
          lastTickAt: pastTime,
          lastMonthEvents: [staleEvent],
          lastPeriodPoints: 42,
          isVIP: false,
        });

        const bonusRegistry = mkBonus({
          version: 1,
          registry: { ['stale']: { bonusAmount: 42 } } as any,
        });

        const result = profile.evictStaleEvents(
          baseWindowAlgoRegistry,
          bonusRegistry,
          baseVipPolicy as any,
        );
        expect(result.evicted).toBeDefined();
        expect(result.evicted).toContain(staleEvent.eventId);
        expect(result.amountOfEventsEvicted).toBe(1);
      });

      it('correctly computes the buckets to be inspected and evicts events from all of them', () => {
        const lastBucket = 10;
        const minutesPassed = 3;
        const pastTime = new Date(
          Date.now() - (minutesPassed * 60 + 10) * 1000,
        ).toISOString();

        const eventA = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName: 'A' as any,
          bucket: (lastBucket + 1) % baseWindowAlgoRegistry.amountOfBuckets,
        });
        const eventB = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(3),
          eventName: 'B' as any,
          bucket: (lastBucket + 2) % baseWindowAlgoRegistry.amountOfBuckets,
        });
        const eventC = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(4),
          eventName: 'C' as any,
          bucket: (lastBucket + 3) % baseWindowAlgoRegistry.amountOfBuckets,
        });
        const eventD = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(5),
          eventName: 'D' as any,
          bucket: (lastBucket + 4) % baseWindowAlgoRegistry.amountOfBuckets,
        });

        const pointsA = 10,
          pointsB = 20,
          pointsC = 30,
          pointsD = 40;
        const profile = makeVipProfile({
          commissionerId: uuid(2),
          lastBucket,
          lastTickAt: pastTime,
          lastMonthEvents: [eventA, eventB, eventC, eventD],
          lastPeriodPoints: pointsA + pointsB + pointsC + pointsD,
          isVIP: false,
        });

        const bonusRegistry = mkBonus({
          version: 1,
          registry: {
            ['A']: { bonusAmount: pointsA },
            ['B']: { bonusAmount: pointsB },
            ['C']: { bonusAmount: pointsC },
            ['D']: { bonusAmount: pointsD },
          } as any,
        });

        const result = profile.evictStaleEvents(
          baseWindowAlgoRegistry,
          bonusRegistry,
          baseVipPolicy as any,
        );

        expect(result.amountOfEventsEvicted).toBe(3);
        const evictedSet = new Set(result.evicted);
        expect(evictedSet).toEqual(
          new Set([eventA.eventId, eventB.eventId, eventC.eventId]),
        );
        expect(profile.lastMonthEvents).toHaveLength(1);
        expect(profile.lastMonthEvents[0].eventId).toBe(eventD.eventId);
        expect(profile.lastPeriodPoints).toBe(pointsD);
        expect(profile.lastBucket).toBe(
          (lastBucket + minutesPassed) % baseWindowAlgoRegistry.amountOfBuckets,
        );
      });

      it('correctly detects VIP threshold cross (vip lost)', () => {
        // TODO
      });

      it('evicts all events if buckets passed > total amount of buckets', () => {
        // TODO
      });
    });

    describe('updateBonusPolicy', () => {
      it('recalculates the points per last stage', () => {
        const eventName = 'bronze' as any;
        const oldPoints = 10;
        const event = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [event],
          lastPeriodPoints: oldPoints,
          isVIP: false,
          bonusPolicyVersion: 1,
        });

        const newBonusPolicy = mkBonus({
          version: 2,
          registry: { [eventName]: { bonusAmount: 20 } } as any,
        });
        const result = profile.updateBonusPolicy(newBonusPolicy);

        expect(result.newLastPeriodPoints).toBe(20);
        expect(profile.lastPeriodPoints).toBe(20);
      });

      it('changes policy version', () => {
        const profile = makeVipProfile({
          commissionerId: uuid(2),
          bonusPolicyVersion: 1,
        });
        const newPolicy = mkBonus({
          version: 5,
          registry: {} as Record<BonusEventName, EventBonusInfo>,
        });
        profile.updateBonusPolicy(newPolicy);
        expect(profile.bonusPolicyVersion).toBe(5);
      });
    });

    describe('updateVipProfileRegistry', () => {
      it('promotes to VIP when threshold is lowered', () => {
        const newThreshold = 500;
        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastPeriodPoints: 800,
          isVIP: false,
          vipPolicyVersion: 1,
        });
        const newVipPolicy = mkVip({
          policyName: 'VipProfileRegistry',
          vipThreshold: newThreshold,
          version: 2,
        });
        const result = profile.updateVipProfileRegistry(newVipPolicy as any);
        expect(result.hadVipBefore).toBe(false);
        expect(result.hasVipNow).toBe(true);
        expect(profile.isVIP).toBe(true);
        expect(profile.vipPolicyVersion).toBe(2);
      });

      it('revokes VIP when threshold is raised above current points', () => {
        const newThreshold = 1000;
        const profile = makeVipProfile({
          commissionerId: uuid(2),
          lastPeriodPoints: 800,
          isVIP: true,
          vipPolicyVersion: 1,
        });
        const newVipPolicy = mkVip({ vipThreshold: newThreshold, version: 2 });
        const result = profile.updateVipProfileRegistry(newVipPolicy as any);
        expect(result.hadVipBefore).toBe(true);
        expect(result.hasVipNow).toBe(false);
        expect(profile.isVIP).toBe(false);
        expect(profile.vipPolicyVersion).toBe(2);
      });

      it('changes policy version', () => {
        const profile = makeVipProfile({
          commissionerId: uuid(3),
          vipPolicyVersion: 1,
          isVIP: false,
        });
        const updatedPolicy = mkVip({ vipThreshold: 2000, version: 2 });
        profile.updateVipProfileRegistry(updatedPolicy as any);
        expect(profile.vipPolicyVersion).toBe(2);
      });
    });

    describe('recalculateWithPolicies', () => {
      it('promotes to VIP when new total crosses the threshold (vip policies intact)', () => {
        const eventName = 'bronze' as any;
        const oldThreshold = 100;
        const oldEventBonusPoints = 20;
        const newEventBonusPoints = 120;

        const event1 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });
        const event2 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [event1, event2],
          lastPeriodPoints: oldEventBonusPoints * 2,
          isVIP: false,
          bonusPolicyVersion: 1,
        });

        const oldVipPolicy = mkVip({ vipThreshold: oldThreshold, version: 1 });
        const newBonusPolicy = mkBonus({
          version: 2,
          registry: {
            [eventName]: { bonusAmount: newEventBonusPoints },
          } as any,
        });

        const result: {
          oldLastPeriodPoints: number;
          newLastPeriodPoints: number;
          hadVipBefore: boolean;
          hasVipNow: boolean;
        } = profile.recalculateWithPolicies(
          oldVipPolicy as any,
          newBonusPolicy,
        );

        expect(result.newLastPeriodPoints).toBe(newEventBonusPoints * 2);
        expect(result.hadVipBefore).toBe(false);
        expect(result.hasVipNow).toBe(true);
        expect(profile.isVIP).toBe(true);
      });

      it('revokes VIP when new total crosses the threshold (vip policies intact)', () => {
        const eventName = 'bronze' as any;
        const oldThreshold = 100;
        const oldEventBonusPoints = 120;
        const newEventBonusPoints = 20;

        const event1 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });
        const event2 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [event1, event2],
          lastPeriodPoints: oldEventBonusPoints * 2,
          isVIP: true,
          bonusPolicyVersion: 1,
        });

        const oldVipPolicy = mkVip({ vipThreshold: oldThreshold, version: 1 });
        const newBonusPolicy = mkBonus({
          version: 2,
          registry: {
            [eventName]: { bonusAmount: newEventBonusPoints },
          } as any,
        });

        const result: {
          oldLastPeriodPoints: number;
          newLastPeriodPoints: number;
          hadVipBefore: boolean;
          hasVipNow: boolean;
        } = profile.recalculateWithPolicies(
          oldVipPolicy as any,
          newBonusPolicy,
        );

        expect(result.newLastPeriodPoints).toBe(newEventBonusPoints * 2);
        expect(result.hadVipBefore).toBe(true);
        expect(result.hasVipNow).toBe(false);
        expect(profile.isVIP).toBe(false);
      });

      it('promotes to VIP when threshold is lowered (bonus policy intact)', () => {
        const eventName = 'bronze' as any;
        const newThreshold = 25;
        const eventBonusPoints = 20;

        const event1 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });
        const event2 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [event1, event2],
          lastPeriodPoints: eventBonusPoints * 2,
          isVIP: false,
          bonusPolicyVersion: 1,
        });

        const newVipPolicy = mkVip({ vipThreshold: newThreshold, version: 2 });
        const oldBonusPolicy = mkBonus({
          version: 1,
          registry: { [eventName]: { bonusAmount: eventBonusPoints } } as any,
        });

        const result: {
          oldLastPeriodPoints: number;
          newLastPeriodPoints: number;
          hadVipBefore: boolean;
          hasVipNow: boolean;
        } = profile.recalculateWithPolicies(
          newVipPolicy as any,
          oldBonusPolicy,
        );

        expect(result.newLastPeriodPoints).toBe(eventBonusPoints * 2);
        expect(profile.lastPeriodPoints).toBe(eventBonusPoints * 2);
        expect(result.hadVipBefore).toBe(false);
        expect(result.hasVipNow).toBe(true);
        expect(profile.isVIP).toBe(true);
      });

      it('revokes VIP when threshold is raised above current points (bonus policy intact)', () => {
        const eventName = 'bronze' as any;
        const newThreshold = 1000;
        const eventBonusPoints = 20;

        const event1 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });
        const event2 = makeLMEvent({
          commissionerId: uuid(1),
          eventId: uuid(2),
          eventName,
          bucket: 0,
        });

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [event1, event2],
          lastPeriodPoints: eventBonusPoints * 2,
          isVIP: true,
          bonusPolicyVersion: 1,
        });

        const newVipPolicy = mkVip({ vipThreshold: newThreshold, version: 2 });
        const oldBonusPolicy = mkBonus({
          version: 1,
          registry: { [eventName]: { bonusAmount: eventBonusPoints } } as any,
        });

        const result: {
          oldLastPeriodPoints: number;
          newLastPeriodPoints: number;
          hadVipBefore: boolean;
          hasVipNow: boolean;
        } = profile.recalculateWithPolicies(
          newVipPolicy as any,
          oldBonusPolicy,
        );

        expect(result.newLastPeriodPoints).toBe(eventBonusPoints * 2);
        expect(profile.lastPeriodPoints).toBe(eventBonusPoints * 2);
        expect(result.hadVipBefore).toBe(true);
        expect(result.hasVipNow).toBe(false);
        expect(profile.isVIP).toBe(false);
      });

      it('changes policy version', () => {
        const newVersionBonus = 3;
        const newVersionVip = 3;

        const profile = makeVipProfile({
          commissionerId: uuid(1),
          lastMonthEvents: [],
          lastPeriodPoints: 0,
          isVIP: false,
          bonusPolicyVersion: 1,
        });

        const newVipPolicy = mkVip({
          vipThreshold: 100,
          version: newVersionVip,
        });
        const newBonusPolicy = mkBonus({
          version: newVersionBonus,
          registry: { ['hail mr. S']: { bonusAmount: 666 } } as any,
        });

        profile.recalculateWithPolicies(newVipPolicy as any, newBonusPolicy);

        expect(profile.vipPolicyVersion).toBe(newVersionVip);
        expect(profile.bonusPolicyVersion).toBe(newVersionBonus);
      });
    });
  });
});
