import {
  GradeName,
  GradePolicyInterface,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/grade.policy';
import { BonusEventEntity } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity';
import {
  BonusEventName,
  BonusEventRegistryInterface,
} from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import { IsUUID, IsEnum, Min, IsInt, IsOptional } from 'class-validator';
import { DomainError } from 'error-handling/error-core';
import { BonusDomainErrorRegistry } from 'error-handling/registries/bonus';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid } from 'shared-kernel';
import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  OneToOne,
  Check,
  VersionColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

//@Index('pk_additive_bonus_commissioner', ['commissionerId'], { unique: true })
@Check(`"total_points" >= 0`)
@Check(`"bonus_algo_policy_version" > 0`)
@Check(`"grade_policy_version"  > 0`)
@Entity({ name: 'additive_bonus' })
export class AdditiveBonus implements EntityTechnicalsInterface {
  @IsUUID()
  @PrimaryColumn('uuid', { name: 'commissioner_id' })
  commissionerId!: string;

  @IsInt()
  @Min(0)
  @Column({ name: 'total_points', type: 'int' })
  totalPoints!: number;

  @IsEnum(GradeName)
  @Column('varchar', { name: 'grade', length: 16, default: 'Bronze' })
  grade!: GradeName;

  @OneToMany(() => BonusEventEntity, (event) => event.profile, { eager: false })
  events!: BonusEventEntity[];

  @IsInt()
  @Min(1)
  @Column({ name: 'bonus_algo_policy_version', type: 'int' })
  bonusPolicyVersion!: number;

  @IsInt()
  @Min(1)
  @Column({ name: 'grade_policy_version', type: 'int' })
  gradePolicyVersion!: number;

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

  @OneToOne(() => VipProfile, { eager: false, onDelete: 'CASCADE' })
  // @JoinColumn({
  //   name: 'commissioner_id',
  //   referencedColumnName: 'commissionerId',
  // })
  vipProfile!: VipProfile;

  constructor(init: {
    commissionerId: string;
    gradePolicy: GradePolicyInterface;
    bonusRegistry: BonusEventRegistryInterface;
  }) {
    // typeorm fix
    if (!init) return;

    this.commissionerId = init.commissionerId;
    this.totalPoints = 0;
    this.grade = init.gradePolicy.getGradeByPoints(0);
    this.bonusPolicyVersion = init.bonusRegistry.version;
    this.gradePolicyVersion = init.gradePolicy.version;

    assertValid(this, BonusDomainErrorRegistry);
  }

  //look up event bonus abount, add it to the total points
  processBonusEvent(
    eventName: BonusEventName,
    BonusEventRegistry: BonusEventRegistryInterface,
    gradePolicy: GradePolicyInterface,
  ): {
    gradeChanged: boolean;
  } {
    this.validatePolicyVersion(gradePolicy);
    this.validatePolicyVersion(BonusEventRegistry);

    if (!(eventName in BonusEventRegistry.registry)) {
      throw new DomainError({
        errorObject: BonusDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
        details: {
          description: `Event ${eventName} is not in the policy registry`,
        },
      });
    }

    const eventInfo = BonusEventRegistry.registry[eventName];
    const bonusAmount = eventInfo.bonusAmount;

    //const oldPoints = this.totalPoints;
    const newPoints = this.totalPoints + bonusAmount;

    const oldGrade = this.grade;
    const newGrade = gradePolicy.getGradeByPoints(newPoints);

    const gradeChanged = oldGrade !== newGrade;

    this.totalPoints = newPoints;
    this.grade = newGrade;

    return { gradeChanged };
  }

  recalculateWithPolicies(
    eventNames: BonusEventName[],
    gradePolicy: GradePolicyInterface,
    BonusEventRegistry: BonusEventRegistryInterface,
  ): {
    oldTotalPoints: number;
    newTotalPoints: number;
    oldGrade: GradeName;
    newGrade: GradeName;
  } {
    this.bonusPolicyVersion = BonusEventRegistry.version;
    this.gradePolicyVersion = gradePolicy.version;

    const oldPoints = this.totalPoints;
    this.recalculateLastPeriodPoints(eventNames, BonusEventRegistry);
    const newPoints = this.totalPoints;

    const oldGrade = this.grade;
    const newGrade = gradePolicy.getGradeByPoints(newPoints);

    this.totalPoints = newPoints;
    this.grade = newGrade;

    return {
      oldTotalPoints: oldPoints,
      newTotalPoints: newPoints,
      oldGrade: oldGrade,
      newGrade: newGrade,
    };
  }

  //take in an array of bonus event names, recalculate the total bonus.
  //don't pass BonusEventEntity entities - need to decouple the aggregates

  /**
   * Recalculate the total bonus points using the given bonus event policy and event name array.
   * Mutates the object in-place
   */
  private recalculateLastPeriodPoints(
    eventNames: BonusEventName[],
    BonusEventRegistry: BonusEventRegistryInterface,
  ): void {
    let total = 0;
    for (const ev of eventNames) {
      const info = BonusEventRegistry.registry[ev];
      if (info) {
        total += info.bonusAmount;
      }
    }
    this.totalPoints = total;
  }

  /**
   * Guard to ensure the passed policy matches the profile's currently applied policy version.
   * Throws an error if the versions differ.
   */
  private validatePolicyVersion<
    p extends BonusEventRegistryInterface | GradePolicyInterface,
  >(policy: p): void {
    if (policy.policyName === 'BonusEventRegistry') {
      if (policy.version !== this.bonusPolicyVersion) {
        throw new DomainError({
          errorObject: BonusDomainErrorRegistry.byCode.POLICY_VERSION_CONFLICT,
          details: {
            description: `Bonus event policy version expected ${this.bonusPolicyVersion}, is ${policy.version}`,
          },
        });
      }
    } else if (policy.policyName === 'GradePolicy') {
      // VipProfileRegistryInterface
      if (policy.version !== this.gradePolicyVersion) {
        throw new DomainError({
          errorObject: BonusDomainErrorRegistry.byCode.POLICY_VERSION_CONFLICT,
          details: {
            description: `Grade event policy version expected ${this.gradePolicyVersion}, is ${policy.version}`,
          },
        });
      }
    }
  }
}
