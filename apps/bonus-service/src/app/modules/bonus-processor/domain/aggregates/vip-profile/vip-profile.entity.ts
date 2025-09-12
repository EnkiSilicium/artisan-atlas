import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import {
  BonusEventName,
  BonusEventRegistryInterface,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import { LastMonthEventSet } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/last-month-event-set.entity';
import { VipProfileRegistryInterface } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.registry';
import { WindowAlgoRegistryInterface } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/window-algo.registry';
import {
  IsUUID,
  IsBoolean,
  IsNumber,
  Min,
  IsInt,
  IsOptional,
} from 'class-validator';
import { DomainError } from 'error-handling/error-core';
import { BonusDomainErrorRegistry } from 'error-handling/registries/bonus';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid, isoNow } from 'shared-kernel';
import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  VersionColumn,
  Check,
  UpdateDateColumn,
  CreateDateColumn,
  OneToOne,
} from 'typeorm';

/**
 * An aggregate root responsible for managing VIP status logic.
 * Manages LastMonthEventSet entities.
 *
 * Implements the "timing wheel" 30-day sum algorithm.
 * Includes helpers for migrations on policy changes.
 *
 */
@Check(`"last_period_points" >= 0`)
@Check(`"last_bucket" >= 0`)
@Check(`"vip_policy_version" > 0`)
@Check(`"window_algo_policy_version" > 0`)
@Check(`"bonus_algo_policy_version" > 0`)
@Entity({ name: 'vip_profile' })
export class VipProfile implements EntityTechnicalsInterface {
  @IsUUID()
  @PrimaryColumn('uuid', { name: 'commissioner_id' })
  commissionerId!: string;

  @IsNumber()
  @Min(0)
  @Column({ name: 'last_period_points', type: 'int', default: 0 })
  lastPeriodPoints: number = 0;

  /**
   * Is here for easier migrations - you don't need to store 2 policy versions in code
   * Facilitates answering the "poolicies changed, do I need to fire VIP status change event".
   */
  @IsBoolean()
  @Column('boolean', { name: 'is_vip', default: false })
  isVIP: boolean = false;

  //@IsISO8601()
  @Column({
    name: 'last_tick_at',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
    default: () => 'now()',
  })
  lastTickAt!: string;

  @IsInt()
  @Min(0)
  @Column({ name: 'last_bucket', type: 'int', default: 0 })
  lastBucket: number = 0;

  @IsInt()
  @Min(1)
  @Column({ name: 'vip_policy_version', type: 'int' })
  vipPolicyVersion!: number;

  @IsInt()
  @Min(1)
  @Column({ name: 'window_algo_policy_version', type: 'int' })
  windowAlgoPolicyVersion!: number;

  @IsInt()
  @Min(1)
  @Column({ name: 'bonus_algo_policy_version', type: 'int' })
  bonusPolicyVersion!: number;

  //@IsISO8601()
  @UpdateDateColumn({
    name: 'last_updated_at',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
  })
  lastUpdatedAt!: string;

  //@IsISO8601()
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
  })
  createdAt!: string;

  @IsOptional()
  @IsInt()
  @VersionColumn({ name: 'version', type: 'int' })
  version!: number;

  @OneToMany(() => LastMonthEventSet, (s: LastMonthEventSet) => s.vipProfile, {
    cascade: false,
    eager: true,
  })
  lastMonthEvents!: LastMonthEventSet[];

  @OneToOne(() => AdditiveBonus, (ab: AdditiveBonus) => ab.vipProfile, {
    eager: false,
  })
  additiveBonus!: AdditiveBonus;

  constructor(
    init: {
      commissionerId: string;
      windowAlgoRegistry: WindowAlgoRegistryInterface;
      vipProfileRegistry: VipProfileRegistryInterface;
      bonusRegistry: BonusEventRegistryInterface;
    },
    skipValidation: boolean = false,
  ) {
    // typeorm fix
    if (!init) return;

    this.commissionerId = init.commissionerId;
    this.lastPeriodPoints = 0;
    this.isVIP = false;
    this.lastBucket = 0;
    this.lastTickAt = isoNow();

    this.vipPolicyVersion = init.vipProfileRegistry.version;
    this.windowAlgoPolicyVersion = init.windowAlgoRegistry.version;
    this.bonusPolicyVersion = init.bonusRegistry.version;

    this.lastMonthEvents = [];

    if (!skipValidation) assertValid(this, BonusDomainErrorRegistry);
  }

  /**
   * Ingest a bonus event into the profile.
   *
   * Returns an object indicating if the VIP threshold was crossed by this event.
   */
  processBonusEvent(
    event: {
      commissionerId: string;
      eventName: BonusEventName;
      eventId: string;
    },
    windowAlgoRegistry: WindowAlgoRegistryInterface,
    vipPolicy: VipProfileRegistryInterface,
    bonusRegistry: BonusEventRegistryInterface,
    skipEventNameValidation: boolean = false,
  ): { vipGained: boolean } {
    // Ensure using the same policy versions as the profile expects
    this.validatePolicyVersion(windowAlgoRegistry);
    this.validatePolicyVersion(vipPolicy);
    this.validatePolicyVersion(bonusRegistry);

    // Ensure event is for this profile
    if (event.commissionerId !== this.commissionerId) {
      throw new DomainError({
        errorObject: BonusDomainErrorRegistry.byCode.INVARIANTS_VIOLATED,
        details: {
          description: `CommissionerId mismatch on event: expected ${this.commissionerId}, is ${event.commissionerId}`,
        },
      });
    }
    // Ensure the event type exists in the bonus policy registry
    if (!(event.eventName in bonusRegistry.registry)) {
      throw new DomainError({
        errorObject: BonusDomainErrorRegistry.byCode.VALIDATION,
        details: {
          description: `Bonus event "${event.eventName}" not found in policy registry`,
        },
      });
    }

    if (!Array.isArray(this.lastMonthEvents)) this.lastMonthEvents = [];

    const eventInfo = bonusRegistry.registry[event.eventName];
    const bonusAmount = eventInfo.bonusAmount;
    // Add the event's bonus points to the total
    const oldPoints = this.lastPeriodPoints;
    this.lastPeriodPoints += bonusAmount;
    // Determine if VIP status threshold has been crossed due to this event
    const vipThresholdCrossed = this.vipThresholdWasCrossed(
      oldPoints,
      this.lastPeriodPoints,
      vipPolicy,
    );
    // Update VIP status if threshold crossed (event.g., gained VIP status)
    if (vipThresholdCrossed) {
      this.isVIP = this.lastPeriodPoints >= vipPolicy.vipThreshold;
    }
    // Record the event in the lastMonthEvents list with the appropriate time bucket

    const Bucket =
      (this.lastBucket + windowAlgoRegistry.amountOfBuckets - 1) %
      windowAlgoRegistry.amountOfBuckets;
    const eventRecord = new LastMonthEventSet(
      {
        commissionerId: this.commissionerId,
        eventId: event.eventId,
        eventName: event.eventName,
        bucket: Bucket,
      },
      skipEventNameValidation,
    );
    this.lastMonthEvents.push(eventRecord);
    return { vipGained: vipThresholdCrossed };
  }

  /**
   * Evict events that occurred earlier than the current 30-day window and subtract their points from the total.
   * Returns an object with the number of events evicted and their IDs.
   */
  evictStaleEvents(
    windowAlgoRegistry: WindowAlgoRegistryInterface,
    bonusRegistry: BonusEventRegistryInterface,
    vipPolicy: VipProfileRegistryInterface,
  ): { amountOfEventsEvicted: number; evicted: string[]; vipLost: boolean } {
    this.validatePolicyVersion(windowAlgoRegistry);
    this.validatePolicyVersion(bonusRegistry);
    this.validatePolicyVersion(vipPolicy);
    const evictedIds: string[] = [];
    const lastTickMs = Date.parse(this.lastTickAt);
    const nowMs = Date.now();
    const bucketIntervalSec = Math.floor(
      windowAlgoRegistry.periodSecondsLength /
        windowAlgoRegistry.amountOfBuckets,
    );
    let diffSec = (nowMs - lastTickMs) / 1000;
    if (diffSec < 0) diffSec = 0;
    const elapsedBuckets = Math.floor(diffSec / bucketIntervalSec);
    if (elapsedBuckets <= 0) {
      // No full bucket intervals have passed since last tick
      return { amountOfEventsEvicted: 0, evicted: [], vipLost: false };
    }
    if (elapsedBuckets >= windowAlgoRegistry.amountOfBuckets) {
      // If the time gap is larger than the entire window, all events are stale
      for (const ev of this.lastMonthEvents) {
        evictedIds.push(ev.eventId);
      }
      // Clear all events and reset points
      this.lastMonthEvents = [];
      const oldPoints = this.lastPeriodPoints;
      const newPoints = 0;
      this.lastPeriodPoints = newPoints;
      // Update VIP status. If crossed, then VIP lost.
      const vipLost = this.vipThresholdWasCrossed(
        oldPoints,
        newPoints,
        vipPolicy,
      );
      if (vipLost) {
        this.isVIP = false;
      }
      // Advance lastBucket to current bucket and update lastTickAt to now
      const nowDate = new Date();
      const nowSec = Math.floor(nowDate.getTime() / 1000);
      const nowBucket =
        Math.floor(nowSec / bucketIntervalSec) %
        windowAlgoRegistry.amountOfBuckets;
      this.lastBucket = nowBucket;
      this.lastTickAt = nowDate.toISOString();

      return {
        amountOfEventsEvicted: evictedIds.length,
        evicted: evictedIds,
        vipLost: vipLost,
      };
    }
    // Determine which buckets to clear (from lastBucket+1 up to lastBucket+elapsedBuckets, wrapping around if needed)
    const bucketsToClear: number[] = [];
    for (let i = 1; i <= elapsedBuckets; i++) {
      bucketsToClear.push(
        (this.lastBucket + i) % windowAlgoRegistry.amountOfBuckets,
      );
    }
    const bucketsToClearSet = new Set(bucketsToClear);
    // Remove events in those buckets and calculate total points to subtract
    let pointsToSubtract = 0;
    const remainingEvents: LastMonthEventSet[] = [];
    for (const ev of this.lastMonthEvents) {
      if (bucketsToClearSet.has(ev.bucket)) {
        evictedIds.push(ev.eventId);
        const evInfo = bonusRegistry.registry[ev.eventName];

        // If event type not in registry, treat its points as 0 for subtraction
        // Although I hope programmers are adults and don't delete events from the registy

        if (evInfo) {
          pointsToSubtract += evInfo.bonusAmount;
        }

        //
      } else {
        remainingEvents.push(ev);
      }
    }
    this.lastMonthEvents = remainingEvents;
    // Adjust total points and VIP status

    const oldPoints = this.lastPeriodPoints;
    const newPoints = Math.max(0, this.lastPeriodPoints - pointsToSubtract);
    this.lastPeriodPoints = newPoints;

    const vipLost = this.vipThresholdWasCrossed(
      oldPoints,
      newPoints,
      vipPolicy,
    );
    if (vipLost) {
      this.isVIP = false;
    }

    // Advance the bucket pointer and update lastTickAt by the elapsed time (in whole buckets)
    this.lastBucket =
      (this.lastBucket + elapsedBuckets) % windowAlgoRegistry.amountOfBuckets;
    const newLastTickMs =
      lastTickMs + elapsedBuckets * bucketIntervalSec * 1000;
    this.lastTickAt = new Date(newLastTickMs).toISOString();
    return {
      amountOfEventsEvicted: evictedIds.length,
      evicted: evictedIds,
      vipLost: vipLost,
    };
  }

  /**
   * Apply a new bonus event policy (event.g., when bonus points values change).
   * Recalculates lastPeriodPoints under the new policy and updates the policy version.
   * Updates the VIP status according to the new policy version
   *
   * If the new policy's version is the same as the old policy's version, does nothing.
   */
  updateBonusPolicy(BonusEventRegistry: BonusEventRegistryInterface): {
    oldLastPeriodPoints: number;
    newLastPeriodPoints: number;
  } {
    const oldBonusPoints = this.lastPeriodPoints;
    // Recalculate total points with the new policy's values
    this.recalculateLastPeriodPoints(BonusEventRegistry);
    // Update the applied bonus policy version
    this.bonusPolicyVersion = BonusEventRegistry.version;
    return {
      newLastPeriodPoints: this.lastPeriodPoints,
      oldLastPeriodPoints: oldBonusPoints,
    };
  }

  /**
   * Apply a new VIP profile policy (event.g., VIP threshold change).
   * Updates the VIP status according to the new threshold and policy version.
   *
   * If the new policy's version is the same as the old policy's version, does nothing.
   */
  updateVipProfileRegistry(vipPolicy: VipProfileRegistryInterface): {
    hadVipBefore: boolean;
    hasVipNow: boolean;
  } {
    const oldVipStatus = this.isVIP;
    // Update VIP status based on the new threshold
    const newVipStatus = this.lastPeriodPoints >= vipPolicy.vipThreshold;
    this.isVIP = newVipStatus;
    this.vipPolicyVersion = vipPolicy.version;
    return { hadVipBefore: oldVipStatus, hasVipNow: newVipStatus };
  }

  /**
   * Recalculates total points / isVIP using the provided policies and
   * sets the new versions.
   *
   * The operations itself is idempotent, however, the return values are not.
   *
   */
  recalculateWithPolicies(
    vipPolicy: VipProfileRegistryInterface,
    BonusEventRegistry: BonusEventRegistryInterface,
  ): {
    oldLastPeriodPoints: number;
    newLastPeriodPoints: number;
    hadVipBefore: boolean;
    hasVipNow: boolean;
  } {
    this.vipPolicyVersion = vipPolicy.version;
    this.bonusPolicyVersion = BonusEventRegistry.version;

    const oldPoints = this.lastPeriodPoints;
    this.recalculateLastPeriodPoints(BonusEventRegistry);
    const newPoints = this.lastPeriodPoints;

    const oldVipStatus = this.isVIP;
    const newVipStatus: boolean = newPoints > vipPolicy.vipThreshold;

    this.isVIP = newVipStatus;

    return {
      oldLastPeriodPoints: oldPoints,
      newLastPeriodPoints: newPoints,
      hadVipBefore: oldVipStatus,
      hasVipNow: newVipStatus,
    };
  }

  /**
   * Recalculate the total bonus points from the last month's events using the given bonus event policy.
   * Mutates the object in-place
   */
  private recalculateLastPeriodPoints(
    BonusEventRegistry: BonusEventRegistryInterface,
  ): void {
    let total = 0;
    for (const ev of this.lastMonthEvents) {
      const info = BonusEventRegistry.registry[ev.eventName];
      if (info) {
        total += info.bonusAmount;
      }
    }
    this.lastPeriodPoints = total;
  }

  /**
   * Guard to ensure the passed policy matches the profile's currently applied policy version.
   * Throws an error if the versions differ.
   */
  private validatePolicyVersion<
    p extends
      | BonusEventRegistryInterface
      | VipProfileRegistryInterface
      | WindowAlgoRegistryInterface,
  >(policy: p): void {
    if (policy.policyName === 'BonusEventRegistry') {
      // BonusEventRegistryInterface
      if (policy.version !== this.bonusPolicyVersion) {
        throw new DomainError({
          errorObject: BonusDomainErrorRegistry.byCode.VALIDATION,
          details: {
            description: `Bonus event policy version expected ${this.bonusPolicyVersion}, is ${policy.version}`,
          },
        });
      }
    } else if (policy.policyName === 'VipProfileRegistry') {
      // VipProfileRegistryInterface
      if (policy.version !== this.vipPolicyVersion) {
        throw new DomainError({
          errorObject: BonusDomainErrorRegistry.byCode.VALIDATION,
          details: {
            description: `Vip profile policy version expected ${this.bonusPolicyVersion}, is ${policy.version}`,
          },
        });
      }
    } else if (policy.policyName === 'WindowAlgoRegistry') {
      // WindowAlgoRegistryInterface
      if (policy.version !== this.windowAlgoPolicyVersion) {
        throw new DomainError({
          errorObject: BonusDomainErrorRegistry.byCode.VALIDATION,
          details: {
            description: `Window algo policy version expected ${this.bonusPolicyVersion}, is ${policy.version}`,
          },
        });
      }
    }
  }

  /**
   * Determine if the VIP threshold has been crossed between the old and new bonus point totals.
   * Returns true if the VIP status should flip (either gained or lost VIP status).
   */
  private vipThresholdWasCrossed(
    oldBonusPoints: number,
    newBonusPoints: number,
    vipProfileRegistry: VipProfileRegistryInterface,
  ): boolean {
    const hadVip = oldBonusPoints >= vipProfileRegistry.vipThreshold;
    const hasVipNow = newBonusPoints >= vipProfileRegistry.vipThreshold;
    return hasVipNow !== hadVip;
  }
}
