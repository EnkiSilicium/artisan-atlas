import { Logger } from '@nestjs/common';
import {
  OrderActions,
  OrderStates,
} from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.enum';
import {
  PendingWorkshopInvitations,
  Cancelled,
  CancelDisputeOpened,
} from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.state';
import {
  Outcome,
  LegalOutcome,
  StateById,
} from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.type';
import { RequestEntity } from 'apps/order-service/src/app/order-workflow/domain/entities/request/request.entity';
import {
  IsUUID,
  IsInt,
  IsBoolean,
  IsObject,
  IsOptional,
} from 'class-validator';
import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { EntityTechnicalsInterface, IsoDateTransformer } from 'persistence';
import { assertValid, isoNow } from 'shared-kernel';
import {
  Index,
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  VersionColumn,
  OneToOne,
} from 'typeorm';

import type { StateClassUnion } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.type';

/**
 * Primary aggregate root/state-machine owning the Order workflow.
 */
@Index('ix_order_commissioner', ['commissionerId'])
@Entity({ name: 'order' })
export class Order implements EntityTechnicalsInterface {
  @IsUUID()
  @PrimaryColumn('uuid', { name: 'order_id' })
  orderId!: string;

  @IsObject()
  @Index()
  @Column('varchar', { name: 'state', length: 64 })
  state!: StateClassUnion;

  @IsUUID()
  @Column('uuid', { name: 'commissioner_id' })
  commissionerId!: string;

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

  @IsBoolean()
  @Column('boolean', { name: 'is_terminated', default: false })
  isTerminated!: boolean;

  @OneToOne(() => RequestEntity, (r) => r.order, { eager: false })
  request!: RequestEntity;

  constructor(init: { commissionerId: string }) {
    // typeorm fix
    if (!init) return;

    this.orderId = crypto.randomUUID();
    this.state = new PendingWorkshopInvitations();
    this.commissionerId = init.commissionerId;

    this.isTerminated = false;
    assertValid(this, OrderDomainErrorRegistry);

    Logger.verbose({
      message: `Order aggregate created`,
      meta: {
        orderId: this.orderId,
        commissionerId: this.commissionerId,
      },
    });
  }

  transitionToPendingCompletion() {
    const action = OrderActions.TransitionToPendingCompletion;
    const assumed = OrderStates.PendingWorkshopInvitations;

    this.assertCurrentStateIs(assumed, this.state, action);

    const outcome: Outcome<typeof assumed, typeof action> = this.state.handle(
      action,
    ) satisfies LegalOutcome<typeof assumed, typeof action>;

    this.state = new outcome.nextState();

    this.lastUpdatedAt = isoNow();
    Logger.verbose({
      message: `Transitioned to ${OrderStates.PendingCompletion}`,
      meta: {
        orderId: this.orderId,
        commissionerId: this.commissionerId,
      },
    });
  }

  markAsCompleted() {
    const action = OrderActions.MarkAsComplete;
    const assumed = OrderStates.PendingCompletion;

    this.assertCurrentStateIs(assumed, this.state, action);

    const outcome: Outcome<typeof assumed, typeof action> = this.state.handle(
      action,
    ) satisfies LegalOutcome<typeof assumed, typeof action>;

    this.state = new outcome.nextState();

    this.lastUpdatedAt = isoNow();
    Logger.verbose({
      message: `Order marked as completed!`,
      meta: {
        orderId: this.orderId,
        commissionerId: this.commissionerId,
      },
    });
  }

  complete() {
    const action = OrderActions.Complete;
    const assumed = OrderStates.MarkedAsCompleted;

    this.assertCurrentStateIs(assumed, this.state, action);

    const outcome: Outcome<typeof assumed, typeof action> = this.state.handle(
      action,
    ) satisfies LegalOutcome<typeof assumed, typeof action>;

    this.state = new outcome.nextState();

    this.lastUpdatedAt = isoNow();
    this.isTerminated = true;
    Logger.verbose({
      message: `Order completed!`,
      meta: {
        orderId: this.orderId,
        commissionerId: this.commissionerId,
      },
    });
  }

  cancelOrder(): OrderStates.Cancelled | OrderStates.CancelDisputeOpened {
    const action = OrderActions.Cancel;

    // Only these non-terminal states can accept Cancel.
    const allowed = [
      OrderStates.PendingWorkshopInvitations,
      OrderStates.PendingCompletion,
      OrderStates.MarkedAsCompleted,
    ] as const;

    this.assertCurrentStateIsOneOf(allowed, this.state, action);

    let nextState: Cancelled | CancelDisputeOpened;
    switch (this.state.stateName) {
      case OrderStates.PendingWorkshopInvitations: {
        const outcome: Outcome<
          OrderStates.PendingWorkshopInvitations,
          OrderActions.Cancel
        > = this.state.handle(action);
        nextState = new outcome.nextState();
        this.state = nextState;
        break;
      }
      case OrderStates.PendingCompletion:
      case OrderStates.MarkedAsCompleted: {
        const outcome: Outcome<
          OrderStates.PendingCompletion | OrderStates.MarkedAsCompleted,
          OrderActions.Cancel
        > = this.state.handle(action);
        nextState = new outcome.nextState();
        this.state = nextState;
        break;
      }
    }

    this.lastUpdatedAt = isoNow();
    this.isTerminated = true;
    Logger.verbose({
      message: `Order cancelled!`,
      meta: {
        orderId: this.orderId,
        commissionerId: this.commissionerId,
      },
    });
    return nextState.stateName
  }
  /**
   * Asserts that the current state equals `assumed`. Narrows `state` on success.
   */
  private assertCurrentStateIs<S extends OrderStates>(
    assumed: S,
    state: StateClassUnion,
    action: OrderActions,
  ): asserts state is StateById[S] {
    if (state.stateName !== assumed) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
        details: {
          description: `Attempt to transition from ${state.stateName} using ${action} - illegal`,
          currentState: state.stateName,
          action,
        },
      });
    }
  }

  /**
   * Asserts that the current state is one of `allowed`. Narrows `state` to the union.
   */
  private assertCurrentStateIsOneOf<S extends OrderStates>(
    allowed: readonly S[],
    state: StateClassUnion,
    action: OrderActions,
  ): asserts state is StateById[S] {
    if (!allowed.includes(state.stateName as S)) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
        details: {
          description: `Attempt to transition from ${state.stateName} using ${action} - illegal`,
          currentState: state.stateName,
          action,
        },
      });
    }
  }
}
