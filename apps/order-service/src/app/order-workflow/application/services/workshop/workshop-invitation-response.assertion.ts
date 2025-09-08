import { Order } from "apps/order-service/src/app/order-workflow/domain/entities/order/order.entity";
import { OrderStates } from "apps/order-service/src/app/order-workflow/domain/entities/order/order.enum";
import { DomainError } from "error-handling/error-core";
import { OrderDomainErrorRegistry } from "error-handling/registries/order";

export function assertIsStillPendingInvitations(order: Order) {
    if (order.state.stateName !== OrderStates.PendingWorkshopInvitations) {
        throw new DomainError({
            errorObject: OrderDomainErrorRegistry.byCode.ILLEGAL_TRANSITION,
            details: {message: `Order is not ${OrderStates.PendingWorkshopInvitations}`}
        })
    }
}