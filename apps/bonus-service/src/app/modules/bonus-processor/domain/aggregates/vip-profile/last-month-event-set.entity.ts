import { BonusEventNameEnum } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import {
  IsUUID,
  IsString,
  IsEnum,
  Min,
  IsInt,
  IsOptional,
} from 'class-validator';
import { BonusDomainErrorRegistry } from 'error-handling/registries/bonus';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid } from 'shared-kernel';
import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
  VersionColumn,
  Check,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

import { BonusEventEntity } from '../common/bonus-event.entity';

import type { BonusEventName } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';

/**
 * Subentity of VipProfile - the respective tables contains all the events over the last [window-period].
 */
@Check(`"bucket" >= 0`)
@Entity({ name: 'last_month_event_set' })
export class LastMonthEventSet implements EntityTechnicalsInterface {
  @PrimaryColumn('uuid', { name: 'event_id' })
  eventId!: string;

  @IsUUID()
  @Column('uuid', { name: 'commissioner_id' })
  commissionerId!: string;

  @IsEnum(BonusEventNameEnum)
  @IsString()
  @Column('varchar', { name: 'event_name', length: 64 })
  eventName!: BonusEventName;

  @IsInt()
  @Min(0)
  @Column('int', { name: 'bucket' })
  bucket!: number;

  @ManyToOne(() => VipProfile, (v: VipProfile) => v.lastMonthEvents, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({
    name: 'commissioner_id',
    referencedColumnName: 'commissionerId',
  })
  vipProfile!: VipProfile;

  /**
   * Tie to the exact event AND the same owner:
   * requires a unique constraint on bonus_event(event_id, commissioner_id)
   * (added in BonusEventEntity as uq_bonus_event_composite).
   * Prevents commissionerId discrepancy.
   */
  @OneToOne(() => BonusEventEntity, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'event_id', referencedColumnName: 'eventId' }])
  event!: BonusEventEntity;

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

  constructor(
    init: {
      commissionerId: string;
      eventId: string;
      eventName: BonusEventName;
      bucket: number;
    },
    skipValidation: boolean = false,
  ) {
    this.commissionerId = init.commissionerId;
    this.eventId = init.eventId;
    this.eventName = init.eventName;
    this.bucket = init.bucket;

    if (!skipValidation) assertValid(this, BonusDomainErrorRegistry);
  }
}
