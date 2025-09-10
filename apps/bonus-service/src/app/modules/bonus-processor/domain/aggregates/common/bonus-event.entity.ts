import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import { BonusEventNameEnum } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import {
  IsUUID,
  IsString,
  Length,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';
import { BonusDomainErrorRegistry } from 'error-handling/registries/bonus';
import { EntityTechnicalsInterface } from 'persistence';
import { IsoDateTransformer } from 'persistence';
import { assertValid, isoNow } from 'shared-kernel';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
  VersionColumn,
  PrimaryColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

import type { BonusEventName } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';

//Index for per-user temporal queries
@Index('ix_bonus_event_comm_created', ['commissionerId', 'createdAt'])
//Exists here for LastMonthEventSet's composite FK"
// @Index('uq_bonus_event_composite', ['eventId', 'commissionerId'], {
//   unique: true,
// })
@Check(`char_length("event_name") >= 1`)
@Entity({ name: 'bonus_event' })
export class BonusEventEntity implements EntityTechnicalsInterface {
  @PrimaryColumn('varchar', { name: 'event_id' })
  eventId!: string;

  @IsUUID()
  @Column('uuid', { name: 'commissioner_id' })
  commissionerId!: string;

  /**
   * Time of injestion into the service.
   */
  //@IsISO8601()
  @Column({
    name: 'injested_at',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
  })
  injestedAt!: string;

  @IsEnum(BonusEventNameEnum)
  @IsString()
  @Length(1, 64)
  @Column('varchar', { name: 'event_name', length: 64 })
  eventName!: BonusEventName;

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

  @ManyToOne(() => AdditiveBonus, (p) => p.events, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({
    name: 'commissioner_id',
    referencedColumnName: 'commissionerId',
  })
  profile!: AdditiveBonus;

  constructor(
    init: {
      eventId: string;
      commissionerId: string;
      injestedAt: string;
      eventName: BonusEventName;
    },
    skipValidation: boolean = false,
  ) {
    // typeorm fix
    if (!init) return;

    this.eventId = init.eventId;
    this.commissionerId = init.commissionerId;
    this.injestedAt = init.injestedAt;
    this.eventName = init.eventName;

    this.createdAt = isoNow();
    assertValid(this, BonusDomainErrorRegistry);

    if (!skipValidation) assertValid(this, BonusDomainErrorRegistry);
  }
}
