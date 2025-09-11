import 'reflect-metadata';

import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import { makeAdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity.mock-factory';
import { makeBonusEvent } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity.mock-factory';

import type {
  GradePolicyInterface,
  GradeInfo,
  GradeName,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/grade.policy';
import type {
  BonusEventName,
  BonusEventRegistryInterface,
  EventBonusInfo,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import type { DomainError } from 'error-handling/error-core';

/**
 * Decouple the grade names from tests and mock getGradeByPoints
 * @warning coupled to tests - change carefully
 */
const baseGradePolicy: GradePolicyInterface = {
  policyName: 'GradePolicy',
  registry: {
    Bronze: { startThreshold: 0 },
    Silver: { startThreshold: 100 },
    Gold: { startThreshold: 300 },
    Platinum: { startThreshold: 1000 },
  } satisfies Record<string, GradeInfo> as Record<GradeName, GradeInfo>,
  defaultGrade: 'Bronze' as GradeName,
  version: 1,
  getGradeByPoints: (points: number) => {
    let grade: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' = 'Bronze';
    if (points >= 0 && points < 100) {
      grade = 'Bronze';
    } else if (points >= 100 && points < 300) {
      grade = 'Silver';
    } else if (points >= 300 && points < 1000) {
      grade = 'Gold';
    } else if (points >= 1000) {
      grade = 'Platinum';
    }
    return grade as GradeName;
  },
};

const mkGrade = (over: Partial<GradePolicyInterface>) => ({
  ...baseGradePolicy,
  ...over,
});

const baseBonusPolicy: BonusEventRegistryInterface = {
  policyName: 'BonusEventRegistry',
  version: 1,
  registry: {} as Record<BonusEventName, EventBonusInfo>,
};

const mkBonus = (over: Partial<BonusEventRegistryInterface>) => ({
  ...baseBonusPolicy,
  ...over,
});

describe('AdditiveBonus', () => {
  describe('constructor', () => {
    it('throws if commissionerId is not UUID', () => {
      expect(() => {
        new AdditiveBonus({
          commissionerId: 'non-uuid',
          gradePolicy: baseGradePolicy,
          bonusRegistry: baseBonusPolicy,
        });
      }).toThrow();
    });

    it('', () => {});
  });

  describe('processBonusEvent', () => {
    it('throws on policy version mismatch', () => {
      const entity = makeAdditiveBonus({
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
      });

      const event = makeBonusEvent({});
      const wrongGradePolicy = mkGrade({
        version: 6,
      });
      const wrongBonusPolicy = mkBonus({
        version: 8,
      });

      expect(() => {
        entity.processBonusEvent(
          event.eventName,
          baseBonusPolicy,
          wrongGradePolicy,
        );
      }).toThrow();
      expect(() => {
        entity.processBonusEvent(
          event.eventName,
          wrongBonusPolicy,
          baseGradePolicy,
        );
      }).toThrow();
      expect(() => {
        entity.processBonusEvent(
          event.eventName,
          wrongBonusPolicy,
          wrongGradePolicy,
        );
      }).toThrow();
    });

    it('includes correct expected version in error details for grade policy mismatch', () => {
      const entity = makeAdditiveBonus({
        bonusPolicyVersion: 1,
        gradePolicyVersion: 2,
      });
      const event = makeBonusEvent({});
      const wrongGradePolicy = mkGrade({ version: 3 });
      const bonusRegistry = mkBonus({
        registry: {
          [event.eventName]: { bonusAmount: 1 },
        } satisfies Record<string, EventBonusInfo> as any,
      });

      expect.assertions(2);
      try {
        entity.processBonusEvent(
          event.eventName,
          bonusRegistry,
          wrongGradePolicy,
        );
      } catch (err) {
        const e = err as DomainError;
        expect(e.details?.description).toContain(
          String(entity.gradePolicyVersion),
        );
        expect(e.details?.description).not.toContain(
          String(entity.bonusPolicyVersion),
        );
      }
    });

    it('throws if event not in registry', () => {
      const entity = makeAdditiveBonus({
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
      });

      const event = makeBonusEvent({
        eventName: 'GGGGG' as BonusEventName,
      });

      expect(() => {
        entity.processBonusEvent(
          event.eventName,
          baseBonusPolicy,
          baseGradePolicy,
        );
      }).toThrow();
    });

    it('correctly increments the totalPoints and detects the grade was changed', () => {
      const eventName = 'name' as BonusEventName;
      const eventBonus = 80;
      const initialTotal = 20;
      const entity = makeAdditiveBonus({
        totalPoints: initialTotal,
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
      });

      const event = makeBonusEvent({ eventName: eventName });

      const bonusRegistry = mkBonus({
        registry: {
          [eventName]: { bonusAmount: eventBonus },
        } satisfies Record<string, EventBonusInfo> as any,
      });

      entity.processBonusEvent(event.eventName, bonusRegistry, baseGradePolicy);

      expect(entity.totalPoints).toBe(initialTotal + eventBonus);
    });

    it('correctly detects if grade was changed and correctly assigns a new grade when the threshold is crossed', () => {
      const eventName1 = 'nam1' as BonusEventName,
        eventName2 = 'name2' as BonusEventName;
      const eventBonus1 = 120,
        eventBonus2 = 999999;
      const initialTotal = 0;
      const entity = makeAdditiveBonus({
        totalPoints: initialTotal,
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
      });

      const event1 = makeBonusEvent({ eventName: eventName1 });
      const event2 = makeBonusEvent({ eventName: eventName2 });

      const bonusRegistry = mkBonus({
        registry: {
          [eventName1]: { bonusAmount: eventBonus1 },
          [eventName2]: { bonusAmount: eventBonus2 },
        } satisfies Record<string, EventBonusInfo> as any,
      });

      const result1 = entity.processBonusEvent(
        event1.eventName,
        bonusRegistry,
        baseGradePolicy,
      );

      expect(result1.gradeChanged).toBe(true);
      expect(entity.grade).toBe('Silver');

      const result2 = entity.processBonusEvent(
        event1.eventName,
        bonusRegistry,
        baseGradePolicy,
      );
      expect(result2.gradeChanged).toBe(false);
      expect(entity.grade).toBe('Silver');

      const result3 = entity.processBonusEvent(
        event2.eventName,
        bonusRegistry,
        baseGradePolicy,
      );
      expect(result3.gradeChanged).toBe(true);
      expect(entity.grade).toBe('Platinum');
    });
  });

  describe('recalculateWithPolicies', () => {
    it('recalculates the total points and correctly assigns the new grade', () => {
      const oldTotal = 120;
      const oldGrade = 'Silver' as GradeName;

      const eventName1 = 'name1' as BonusEventName;
      const eventName2 = 'name2' as BonusEventName;
      const eventName3 = 'name3' as BonusEventName;
      const eventBonus1 = 10,
        eventBonus2 = 20,
        eventBonus3 = 30;

      const event1 = makeBonusEvent({ eventName: eventName1 });
      const event2 = makeBonusEvent({ eventName: eventName2 });
      const event3 = makeBonusEvent({ eventName: eventName3 });

      const newGrade1 = 'super',
        newGrade2 = 'supergiga',
        newGrade3 = 'megasupergiga';
      const threshold1 = 0,
        threshold2 = 10,
        threshold3 = 60;

      const newBonusPolicy = mkBonus({
        registry: {
          [eventName1]: { bonusAmount: eventBonus1 },
          [eventName2]: { bonusAmount: eventBonus2 },
          [eventName3]: { bonusAmount: eventBonus3 },
        } satisfies Record<string, EventBonusInfo> as any,
      });

      const newGradePolicy = mkGrade({
        registry: {
          [newGrade1]: { startThreshold: threshold1 },
          [newGrade2]: { startThreshold: threshold2 },
          [newGrade3]: { startThreshold: threshold3 },
        } satisfies Record<string, GradeInfo> as any,
        getGradeByPoints: (points: number) => {
          let grade;
          if (points >= 0 && points < 10) {
            grade = newGrade1;
          } else if (points >= 10 && points < 60) {
            grade = newGrade2;
          } else if (points >= 60) {
            grade = newGrade3;
          }
          return grade as GradeName;
        },
        defaultGrade: newGrade1 as GradeName,
      });

      const entity = makeAdditiveBonus({
        totalPoints: oldTotal,
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
        grade: oldGrade,
      });

      const result1 = entity.recalculateWithPolicies(
        [event1.eventName, event2.eventName, event3.eventName],
        baseGradePolicy,
        newBonusPolicy,
      );

      expect(result1.oldGrade).toBe(oldGrade);
      expect(result1.oldGrade).toBe(oldGrade);
      expect(result1.oldTotalPoints).toBe(oldTotal);
      expect(result1.newTotalPoints).toBe(
        eventBonus1 + eventBonus2 + eventBonus3,
      );

      const result2 = entity.recalculateWithPolicies(
        [event1.eventName, event2.eventName, event3.eventName],
        newGradePolicy,
        newBonusPolicy,
      );

      expect(result2.oldGrade).toBe('Bronze');
      expect(result2.newGrade).toBe(newGrade3);
      expect(result2.oldTotalPoints).toBe(
        eventBonus1 + eventBonus2 + eventBonus3,
      );
      expect(result2.newTotalPoints).toBe(
        eventBonus1 + eventBonus2 + eventBonus3,
      );
    });

    it('changes policy version', () => {
      const entity = makeAdditiveBonus({
        bonusPolicyVersion: 1,
        gradePolicyVersion: 1,
      });

      const newVersionBonus = 33;
      const newBonusPolicy = mkBonus({
        version: newVersionBonus,
      });

      const newVersionGrade = 77;
      const newGradePolicy = mkGrade({
        version: newVersionGrade,
      });

      entity.recalculateWithPolicies(
        [] as BonusEventName[],
        newGradePolicy,
        newBonusPolicy,
      );

      expect(entity.bonusPolicyVersion).toBe(newVersionBonus);
      expect(entity.gradePolicyVersion).toBe(newVersionGrade);
    });
  });

  describe('blank', () => {
    it('', () => {});
  });
});
