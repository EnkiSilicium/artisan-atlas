import { Logger } from '@nestjs/common';
import { StageStatus } from 'apps/order-service/src/app/order-workflow/domain/entities/stage/stage-status.enum';
import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsBoolean,
  Length,
  IsNumber,
  Min,
  IsEnum,
  IsInt,
  IsOptional,
} from 'class-validator';
import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid } from 'shared-kernel';
import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
  Check,
  UpdateDateColumn,
  VersionColumn,
  CreateDateColumn,
} from 'typeorm';

import { WorkshopInvitation } from '../workshop-invitation/workshop-invitation.entity';

/**
 * Aggregate root for Stage entity.
 *
 */
export class StagesAggregate {
  stages: Stage[] = [];

  amountOfStages = 0;

  /**
   * Pointer into 0-base array of stages.
   * If [lastIndex + 1], that indicates all stages are finished.
   */
  currentStage = 0;

  constructor(init: Array<Stage | constructStageData>) {
    // normalize inputs to Stage instances
    const nameSet = new Set<string>();

    for (const item of init) {
      const s = this.isStageInstance(item) ? item : new Stage(item);

      if (this.stages[s.stageOrder] !== undefined) {
        throw new DomainError({
          errorObject: OrderDomainErrorRegistry.byCode.VALIDATION,
          details: {
            description: `duplicate stage_order at index ${s.stageOrder}`,
          },
        });
      }
      if (nameSet.has(s.stageName)) {
        throw new DomainError({
          errorObject: OrderDomainErrorRegistry.byCode.VALIDATION,
          details: { description: `duplicate stage_name "${s.stageName}"` },
        });
      }

      this.stages[s.stageOrder] = s;
      nameSet.add(s.stageName);
    }

    // Ensure no holes: stageOrder must be 0..N-1 contiguous
    // length is highestIndex+1 for arrays; iterate and ensure all defined
    this.amountOfStages = this.stages.length;
    for (let i = 0; i < this.amountOfStages; i++) {
      if (!this.stages[i]) {
        throw new DomainError({
          errorObject: OrderDomainErrorRegistry.byCode.VALIDATION,
          details: {
            description: `Stage with stageOrder ${i} is expected but missing. Ensure the first stage has order 0 and there are not gaps.`,
          },
        });
      }
    }

    // Compute first pending index; if none, set to amountOfStages
    this.currentStage = this.findFirstNonCompleted() ?? this.amountOfStages;

    Logger.verbose({
      message: `Created stages: ${init.map((i) => i.stageName).join(` ,`)}`,
    });
  }

  acceptCompletionMarked(data: { stageName: string }): {
    allCompleted: boolean;
    stageCompleted: boolean;
  } {
    const stage = this.getStageByName(data.stageName);

    if (stage.stageOrder !== this.currentStage) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.INVARIANTS_VIOLATED,
        details: {
          description: `Incorrect completionMarked order, current stage is ${this.stages[this.currentStage].stageName}`,
        },
      });
    }

    const newStatus: StageStatus = stage.acceptCompletionMarked();

    // Advance current pointer if we just completed the current stage
    this.advanceCurrentIfCompleted(stage.stageOrder);

    const stageCompleted: boolean = newStatus === StageStatus.Completed;
    const allCompleted = this.currentStage === this.amountOfStages;
    return { allCompleted, stageCompleted };
  }

  confirmStage(data: { stageName: string }): {
    allCompleted: boolean;
  } {
    const stage = this.getStageByName(data.stageName);

    if (stage.stageOrder !== this.currentStage) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.INVARIANTS_VIOLATED,
        details: {
          description: `Incorrect completionMarked order, current stage is ${this.stages[this.currentStage].stageName}`,
        },
      });
    }

    stage.confirmStage();

    this.advanceCurrentIfCompleted(stage.stageOrder);

    const allCompleted = this.currentStage === this.amountOfStages;
    return { allCompleted };
  }

  // TODO: change fields of a stage by name or order,

  editStage() {}

  private isStageInstance(value: unknown): value is Stage {
    return value instanceof Stage;
  }

  private getStageByName(stageName: string): Stage {
    const s = this.stages.find((st) => st.stageName === stageName);
    if (!s) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.NOT_FOUND,
        details: { description: `Stage ${stageName} does not exist` },
      });
    }
    return s;
  }

  /**
   * @returns the index of last completed stage, or undefined if all completed
   */
  private findFirstNonCompleted(): number | undefined {
    for (let i = 0; i < this.amountOfStages; i++) {
      if (this.stages[i].status !== StageStatus.Completed) return i;
    }
    return undefined;
  }

  /**
   * If the current stage got completed, recalculate the current stage by finding first non-completed
   * @param changedOrder
   */
  private advanceCurrentIfCompleted(changedOrder: number): void {
    if (
      changedOrder === this.currentStage &&
      this.stages[changedOrder].status === StageStatus.Completed
    ) {
      //technically, would work even if StageStatus = awaitingConfiramtion
      const next = this.findFirstNonCompleted();
      this.currentStage = next ?? this.amountOfStages;
    }
  }
}

/**
 * Stage instance. Is a subentity of StagesAggregate - do not interract with it directly.
 *
 */
@Unique('uq_stage_order_index', ['orderId', 'workshopId', 'stageOrder'])
@Index('ix_stage_lookup', ['orderId', 'workshopId', 'stageOrder'])
@Check('chk_stage_order_nonneg', `"stage_order" >= 0`)
@Entity({ name: 'stage' })
export class Stage implements EntityTechnicalsInterface {
  @IsUUID()
  @PrimaryColumn('uuid', { name: 'order_id' })
  orderId!: string;

  @IsUUID()
  @PrimaryColumn('uuid', { name: 'workshop_id' })
  workshopId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  @PrimaryColumn('varchar', { name: 'stage_name', length: 120 })
  stageName!: string;

  @ManyToOne(() => WorkshopInvitation, (o) => o.stages, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn([
    { name: 'order_id', referencedColumnName: 'orderId' },
    { name: 'workshop_id', referencedColumnName: 'workshopId' },
  ])
  workshopInvitation!: WorkshopInvitation;

  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  @Column('varchar', { name: 'approximate_length', length: 64 })
  approximateLength!: string;

  @IsBoolean()
  @Column('boolean', { name: 'needs_confirmation', default: false })
  needsConfirmation!: boolean;

  @IsString()
  @IsNotEmpty()
  @Column('text', { name: 'description' })
  description!: string;

  @IsEnum(StageStatus)
  @IsString()
  @IsNotEmpty()
  @Length(1, 32)
  @Column({
    name: 'status',
    type: 'enum',
    enum: StageStatus,
    enumName: 'stage_status',
  })
  status!: StageStatus;

  /**
   * First value - zero
   */
  @IsNumber()
  @Min(0)
  @Column('integer', { name: 'stage_order' })
  stageOrder!: number;

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

  constructor(init: constructStageData) {
    // typeorm fix
    if (!init) return;

    this.orderId = init.orderId;
    this.workshopId = init.workshopId;
    this.stageName = init.stageName;
    this.approximateLength = init.approximateLength;
    this.needsConfirmation = init.needsConfirmation ?? false;
    this.description = init.description;
    this.stageOrder = init.stageOrder;
    this.status = StageStatus.Pending;

    assertValid(this, OrderDomainErrorRegistry); // runs class-validator decorators
  }

  acceptCompletionMarked(): StageStatus {
    this.assertStatusIs(StageStatus.Pending);

    this.status = this.needsConfirmation
      ? StageStatus.AwaitingConfirmation
      : StageStatus.Completed;

    Logger.verbose({
      message: `Stage ${this.stageName} number ${this.stageOrder} marked as completed!`,
      meta: {
        orderId: this.orderId,
        workshopId: this.workshopId,
        stageName: this.stageName,
      },
    });

    return this.status;
  }

  confirmStage() {
    this.assertStatusIs(StageStatus.AwaitingConfirmation);
    this.status = StageStatus.Completed;
    Logger.verbose({
      message: `Stage ${this.stageName} number ${this.stageOrder} confirmed!`,
      meta: {
        orderId: this.orderId,
        workshopId: this.workshopId,
        stageName: this.stageName,
      },
    });
  }

  editStage() {}

  private assertStatusIs<s extends StageStatus>(
    status: s,
  ): asserts status is s {
    if (this.status !== status) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
        details: {
          description: `Stage status mismatch: expected ${status}, is ${this.status}`,
        },
      });
    }
  }
}

export type constructStageData = {
  orderId: string;
  workshopId: string;
  stageName: string;
  approximateLength: string;
  needsConfirmation: boolean;
  description: string;
  stageOrder: number;
};
