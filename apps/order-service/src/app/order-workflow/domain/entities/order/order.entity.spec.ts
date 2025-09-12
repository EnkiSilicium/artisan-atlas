// Adjust the import to your file location

import { randomUUID } from 'crypto';

import { Order } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity';
import { makeOrder } from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.entity.mock-factory';
import {
  OrderStates,
  OrderActions,
} from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.enum';
import {
  PendingWorkshopInvitations,
  PendingCompletion,
  MarkedAsCompleted,
  Completed,
  Cancelled,
  CancelDisputeOpened,
  StateRegistry,
} from 'apps/order-service/src/app/order-workflow/domain/entities/order/order.state';

const T0 = '2025-01-01T00:00:00.000Z';

function makeOrderIn(initial: OrderStates): Order {
  const map = StateRegistry;
  return makeOrder({
    orderId: '11111111-1111-4111-8111-111111111111',
    commissionerId: '22222222-1111-4111-8111-111111111111',
    createdAt: T0,
    lastUpdatedAt: T0,
    isTerminated: false,
    state: new map[initial](),
  });
}

describe('Order state machine', () => {
  describe('Order constructor', () => {
    it('initializes with defaults', () => {
      const commissionerId = randomUUID();
      const order = new Order({ commissionerId });
      expect(order.orderId).toBeDefined();
      expect(order.commissionerId).toBe(commissionerId);
      expect(order.state).toBeInstanceOf(PendingWorkshopInvitations);
      expect(order.isTerminated).toBe(false);
    });
  });
  describe('[Initial: PendingWorkshopInvitations]', () => {
    it('legal: TransitionToPendingCompletion -> PendingCompletion; lastUpdatedAt changes', () => {
      const o = makeOrderIn(OrderStates.PendingWorkshopInvitations);
      o.transitionToPendingCompletion();
      expect(o.state).toBeInstanceOf(PendingCompletion);
      expect(o.lastUpdatedAt).not.toBe(T0); // changed, exact value irrelevant
      expect(typeof o.lastUpdatedAt).toBe('string');
      expect(o.isTerminated).toBe(false);
    });

    it('legal: Cancel -> Cancelled; lastUpdatedAt changes; terminated true', () => {
      const o = makeOrderIn(OrderStates.PendingWorkshopInvitations);
      o.cancelOrder();
      expect(o.state).toBeInstanceOf(Cancelled);
      expect(o.lastUpdatedAt).not.toBe(T0);
      expect(o.isTerminated).toBe(true);
    });

    it('illegal: Complete throws; lastUpdatedAt unchanged; not terminated', () => {
      const o = makeOrderIn(OrderStates.PendingWorkshopInvitations);
      expect(() => o.complete()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
      expect(o.isTerminated).toBe(false);
    });

    it('illegal (handler): MarkAsComplete from PendingWorkshopInvitations is illegal', () => {
      const s = new PendingWorkshopInvitations();
      const out = s.handle(OrderActions.MarkAsComplete);
      expect(out.type).toBe('illegal');
    });
  });

  describe('[Initial: PendingCompletion]', () => {
    it('legal (handler): MarkAsComplete -> MarkedAsCompleted', () => {
      const s = new PendingCompletion();
      const out = s.handle(OrderActions.MarkAsComplete);
      expect(out.type).toBe('legal');
      expect(out.nextState).toBe(MarkedAsCompleted);
    });

    it('legal (entity): Cancel -> CancelDisputeOpened; lastUpdatedAt changes; terminated true', () => {
      const o = makeOrderIn(OrderStates.PendingCompletion);
      o.cancelOrder();
      expect(o.state).toBeInstanceOf(CancelDisputeOpened);
      expect(o.lastUpdatedAt).not.toBe(T0);
      expect(o.isTerminated).toBe(true);
    });

    it('illegal: TransitionToPendingCompletion throws; lastUpdatedAt unchanged', () => {
      const o = makeOrderIn(OrderStates.PendingCompletion);
      expect(() => o.transitionToPendingCompletion()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
    });

    it('illegal: Complete throws; lastUpdatedAt unchanged; not terminated', () => {
      const o = makeOrderIn(OrderStates.PendingCompletion);
      expect(() => o.complete()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
      expect(o.isTerminated).toBe(false);
    });
  });

  describe('[Initial: MarkedAsCompleted]', () => {
    it('legal: Complete -> Completed; lastUpdatedAt changes; terminated true', () => {
      const o = makeOrderIn(OrderStates.MarkedAsCompleted);
      o.complete();
      expect(o.state).toBeInstanceOf(Completed);
      expect(o.lastUpdatedAt).not.toBe(T0);
      expect(o.isTerminated).toBe(true);
    });

    it('legal: Cancel -> CancelDisputeOpened; lastUpdatedAt changes; terminated true', () => {
      const o = makeOrderIn(OrderStates.MarkedAsCompleted);
      o.cancelOrder();
      expect(o.state).toBeInstanceOf(CancelDisputeOpened);
      expect(o.lastUpdatedAt).not.toBe(T0);
      expect(o.isTerminated).toBe(true);
    });

    it('illegal: TransitionToPendingCompletion throws; lastUpdatedAt unchanged; not terminated', () => {
      const o = makeOrderIn(OrderStates.MarkedAsCompleted);
      expect(() => o.transitionToPendingCompletion()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
      expect(o.isTerminated).toBe(false);
    });
  });

  describe('[Initial: Completed]', () => {
    it('illegal: TransitionToPendingCompletion throws; lastUpdatedAt unchanged', () => {
      const o = makeOrderIn(OrderStates.Completed);
      expect(() => o.transitionToPendingCompletion()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
    });

    it('illegal: Complete throws; lastUpdatedAt unchanged; not terminated', () => {
      const o = makeOrderIn(OrderStates.Completed);
      expect(() => o.complete()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
      expect(o.isTerminated).toBe(false);
    });

    it('illegal: Cancel throws (terminal); lastUpdatedAt unchanged', () => {
      const o = makeOrderIn(OrderStates.Completed);
      expect(() => o.cancelOrder()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
      expect(o.isTerminated).toBe(false);
    });
  });

  describe('[Initial: Cancelled]', () => {
    it('illegal: any action throws; lastUpdatedAt unchanged', () => {
      const o = makeOrderIn(OrderStates.Cancelled);
      expect(() => o.transitionToPendingCompletion()).toThrow();
      expect(() => o.complete()).toThrow();
      expect(() => o.cancelOrder()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
    });
  });

  describe('[Initial: CancelDisputeOpened]', () => {
    it('illegal: any action throws; lastUpdatedAt unchanged', () => {
      const o = makeOrderIn(OrderStates.CancelDisputeOpened);
      expect(() => o.transitionToPendingCompletion()).toThrow();
      expect(() => o.complete()).toThrow();
      expect(() => o.cancelOrder()).toThrow();
      expect(o.lastUpdatedAt).toBe(T0);
    });
  });

  // Sanity: handlers encode the transition table; no time checks
  describe('[Handler sanity]', () => {
    it('PendingWorkshopInvitations allows only TransitionToPendingCompletion and Cancel', () => {
      const s = new PendingWorkshopInvitations();
      expect(s.handle(OrderActions.TransitionToPendingCompletion).type).toBe(
        'legal',
      );
      expect(s.handle(OrderActions.Cancel).type).toBe('legal');
      expect(s.handle(OrderActions.MarkAsComplete).type).toBe('illegal');
      expect(s.handle(OrderActions.Complete).type).toBe('illegal');
    });

    it('PendingCompletion allows MarkAsComplete and Cancel', () => {
      const s = new PendingCompletion();
      expect(s.handle(OrderActions.MarkAsComplete).type).toBe('legal');
      expect(s.handle(OrderActions.Cancel).type).toBe('legal');
      expect(s.handle(OrderActions.TransitionToPendingCompletion).type).toBe(
        'illegal',
      );
      expect(s.handle(OrderActions.Complete).type).toBe('illegal');
    });

    it('MarkedAsCompleted allows Complete and Cancel', () => {
      const s = new MarkedAsCompleted();
      expect(s.handle(OrderActions.Complete).type).toBe('legal');
      expect(s.handle(OrderActions.Cancel).type).toBe('legal');
      expect(s.handle(OrderActions.MarkAsComplete).type).toBe('illegal');
      expect(s.handle(OrderActions.TransitionToPendingCompletion).type).toBe(
        'illegal',
      );
    });

    it('Terminal states have no legal handlers', () => {
      for (const S of [Completed, Cancelled, CancelDisputeOpened] as const) {
        const s = new S();
        expect(s.handle(OrderActions.TransitionToPendingCompletion).type).toBe(
          'illegal',
        );
        expect(s.handle(OrderActions.MarkAsComplete).type).toBe('illegal');
        expect(s.handle(OrderActions.Complete).type).toBe('illegal');
        expect(s.handle(OrderActions.Cancel).type).toBe('illegal');
      }
    });
  });
});
