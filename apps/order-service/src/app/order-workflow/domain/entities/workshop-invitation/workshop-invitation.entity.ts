import { Logger } from '@nestjs/common';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import { Stage } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage.entity';
import { WorkshopInvitationStatus } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.enum';
import {
  IsUUID,
  ValidateIf,
  IsString,
  IsNotEmpty,
  IsEnum,
  Length,
  IsOptional,
  IsInt,
} from 'class-validator';
import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid } from 'shared-kernel';
import {
  Check,
  Index,
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  VersionColumn,
  OneToMany,
} from 'typeorm';

//  - pending|declined -> description, deadline, budget are NULL
@Check(
  'chk_workshopInvitation_payload_by_status',
  `
  (
    "status" = '${WorkshopInvitationStatus.Accepted}'
    AND description IS NOT NULL
    AND deadline IS NOT NULL
    AND budget IS NOT NULL
  )
  OR
  (
    "status" IN ('${WorkshopInvitationStatus.Pending}', '${WorkshopInvitationStatus.Declined}')
    AND description IS NULL
    AND deadline IS NULL
    AND budget IS NULL
  )
  `,
)
@Index('ix_workshopInvitation_order_status', ['orderId', 'status'])
@Index('ix_workshopInvitation_workshop', ['workshopId'])
@Index('uq_workshopInvitation_order_accepted', ['orderId'], {
  unique: true,
  where: `"status" = '${WorkshopInvitationStatus.Accepted}'`,
})
@Entity({ name: 'workshop_invitation' })
export class WorkshopInvitation implements EntityTechnicalsInterface {
  // composite PK: one workshopInvitation per (order, workshop)
  @IsUUID(4, {
    groups: [
      WorkshopInvitationStatus.Pending,
      WorkshopInvitationStatus.Declined,
      WorkshopInvitationStatus.Accepted,
    ],
  })
  @PrimaryColumn('uuid', { name: 'order_id' })
  orderId!: string;

  @IsUUID(4, {
    groups: [
      WorkshopInvitationStatus.Pending,
      WorkshopInvitationStatus.Declined,
      WorkshopInvitationStatus.Accepted,
    ],
  })
  @PrimaryColumn('uuid', { name: 'workshop_id' })
  workshopId!: string;

  @ManyToOne(() => RequestEntity, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'orderId' })
  request!: RequestEntity;

  // These are nullable in DB because "pending/declined" must not carry payload.
  // Validators require them only for 'accepted'.
  @ValidateIf((o) => o?.status === WorkshopInvitationStatus.Accepted)
  @IsString({ groups: [WorkshopInvitationStatus.Accepted, 'description'] })
  @IsNotEmpty({ groups: [WorkshopInvitationStatus.Accepted, 'description'] })
  @Column('text', { name: 'description', nullable: true })
  description!: string | null;

  @ValidateIf((o) => o?.status === WorkshopInvitationStatus.Accepted)
  //@IsISO8601({}, { groups: [WorkshopInvitationStatus.Accepted, 'deadline'] })
  @IsNotEmpty({ groups: [WorkshopInvitationStatus.Accepted, 'deadline'] })
  @Column({
    name: 'deadline',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
    nullable: true,
  })
  deadline!: string | null;

  @ValidateIf((o) => o?.status === WorkshopInvitationStatus.Accepted)
  @IsString({ groups: [WorkshopInvitationStatus.Accepted, 'budget'] })
  @IsNotEmpty({ groups: [WorkshopInvitationStatus.Accepted, 'budget'] })
  @Column('varchar', { name: 'budget', length: 64, nullable: true })
  budget!: string | null;

  @IsEnum(WorkshopInvitationStatus, {
    groups: [
      WorkshopInvitationStatus.Pending,
      WorkshopInvitationStatus.Accepted,
      'status',
      WorkshopInvitationStatus.Declined,
    ],
  })
  @Length(1, 32, {
    groups: [
      WorkshopInvitationStatus.Pending,
      WorkshopInvitationStatus.Accepted,
      'status',
      WorkshopInvitationStatus.Declined,
    ],
  })
  @Column({
    name: 'status',
    type: 'enum',
    enum: WorkshopInvitationStatus,
    enumName: 'workshopInvitation_status',
  })
  status!: WorkshopInvitationStatus;

  @IsOptional()
  //@IsISO8601()
  @UpdateDateColumn({
    name: 'last_updated_at',
    type: 'timestamptz',
    transformer: IsoDateTransformer,
  })
  lastUpdatedAt!: string;

  @IsOptional()
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

  @OneToMany(() => Stage, (s) => s.workshopInvitation, {
    cascade: true,
    eager: false,
  })
  stages!: Stage[];

  constructor(init: { orderId: string; workshopId: string }) {
    // typeorm fix
    if (!init) return;

    this.orderId = init.orderId;
    this.workshopId = init.workshopId;
    this.status = WorkshopInvitationStatus.Pending;

    //this.placedAt = isoNow();
    //this.lastUpdatedAt = this.placedAt
    assertValid(this, OrderDomainErrorRegistry);
    Logger.verbose({
      message: `Workshop invitation created!`,
      meta: {
        orderId: this.orderId,
        workshopId: this.workshopId,
      },
    });
  }

  accept(data: { description: string; deadline: string; budget: string }) {
    this.assertWorkshopInvitationStatusIs(WorkshopInvitationStatus.Pending);

    const o = Object.create(WorkshopInvitation.prototype) as WorkshopInvitation;
    Object.assign(o, this);

    o.deadline = data.deadline;
    o.description = data.description;
    o.budget = data.budget;
    o.status = WorkshopInvitationStatus.Accepted;

    assertValid(o, OrderDomainErrorRegistry);

    Object.assign(this, o);

    Logger.verbose({
      message: `Workshop invitation accepted!`,
      meta: {
        orderId: this.orderId,
        workshopId: this.workshopId,
      },
    });
  }

  decline() {
    this.assertWorkshopInvitationStatusIs(WorkshopInvitationStatus.Pending);

    this.status = WorkshopInvitationStatus.Declined;
  }

  editBudget(budget: string) {
    const oldBudget = this.budget;
    this.assertWorkshopInvitationStatusIs(WorkshopInvitationStatus.Accepted);

    this.budget = budget;

    try {
      assertValid(this, OrderDomainErrorRegistry, ['budget']);
    } catch (error) {
      this.budget = oldBudget;
      throw error;
    }
  }

  editDescription(description: string) {
    const oldDescription = this.description;
    this.assertWorkshopInvitationStatusIs(WorkshopInvitationStatus.Accepted);
    this.description = description;

    try {
      assertValid(this, OrderDomainErrorRegistry, ['description']);
    } catch (error) {
      this.description = oldDescription;
      throw error;
    }
  }

  editDeadline(deadline: string) {
    const oldDeadline = this.deadline;
    this.assertWorkshopInvitationStatusIs(WorkshopInvitationStatus.Accepted);
    this.deadline = deadline;

    try {
      assertValid(this, OrderDomainErrorRegistry, ['deadline']);
    } catch (error) {
      this.deadline = oldDeadline;
      throw error;
    }
  }

  private assertWorkshopInvitationStatusIs<s extends WorkshopInvitationStatus>(
    status: s,
  ): asserts status is s {
    if (!(this.status === status)) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
        details: {
          description: `Workshop Invitation status mismatch: expected ${status}, is ${this.status}`,
        },
      });
    }
  }
}
