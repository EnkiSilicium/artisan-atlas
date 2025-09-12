/* eslint-disable */
import { OrderActions } from './order.enum';

import type { OrderStates } from './order.enum';
import type { StateRegistry } from './order.state';
import type { LegalOutcome, IllegalOutcome, NextActions } from './order.type';


/**
 * The file below is a type state machine test.
 * If compiler does not say anything, tests passed
 */



// Completed is a terminal state and exposes no next actions.
// @ts-expect-error Terminal states should not accept any action
const completedHasAction: NextActions<OrderStates.Completed> =
  OrderActions.Cancel;

// Illegal actions against terminal states yield IllegalOutcome.
type CompletedState = InstanceType<
  (typeof StateRegistry)[OrderStates.Completed]
>;
const completedState = {} as CompletedState;
const completedResult = completedState.handle(OrderActions.Cancel);
const completedIsIllegal: IllegalOutcome = completedResult;
// @ts-expect-error Completed state cannot produce a legal outcome
const completedIsLegal: LegalOutcome<
  OrderStates.Completed,
  NextActions<OrderStates.Completed>
> = completedResult;

// PendingCompletion has at least one valid action and should return legal outcomes.
type PendingCompletionState = InstanceType<
  (typeof StateRegistry)[OrderStates.PendingCompletion]
>;
const pendingCompletionState = {} as PendingCompletionState;
const validAction = null as any as NextActions<OrderStates.PendingCompletion>;
const pendingLegal = pendingCompletionState.handle(validAction);
const pendingIsLegal: LegalOutcome<
  OrderStates.PendingCompletion,
  NextActions<OrderStates.PendingCompletion>
> = pendingLegal;
// @ts-expect-error Legal outcome is not assignable to IllegalOutcome
const pendingLegalIsIllegal: IllegalOutcome = pendingLegal;

// PendingCompletion should reject invalid actions.
const invalidAction = null as any as Exclude<
  OrderActions,
  NextActions<OrderStates.PendingCompletion>
>;
const pendingIllegal = pendingCompletionState.handle(invalidAction);
const pendingIsIllegal: IllegalOutcome = pendingIllegal;
// @ts-expect-error Illegal outcome is not assignable to LegalOutcome
const pendingIllegalIsLegal: LegalOutcome<
  OrderStates.PendingCompletion,
  NextActions<OrderStates.PendingCompletion>
> = pendingIllegal;

export {};
