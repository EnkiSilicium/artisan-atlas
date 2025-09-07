// apps/order-service/src/app/order-workflow/infra/auth/guards/jwt-ownership.guard.ts
import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertBelongsTo } from 'apps/order-service/src/app/order-workflow/infra/auth/assertions/assert-belongs-to.assertion';
import { OrderRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/order/order.repo';
import { WorkshopInvitationRepo } from 'apps/order-service/src/app/order-workflow/infra/persistence/repositories/workshop-invitation/workshop-invitation.repo';
import { DomainError, ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { Request } from 'express';

import { ActorEntityFieldMap, ActorName, Principal } from 'auth';

type AnyPayload = {
    principal?: Principal;
    orderId?: string;
    workshopId?: string;
    [k: string]: unknown;
};

@Injectable()
export class OrderHttpJwtGuard extends AuthGuard('jwt') implements CanActivate {
    private readonly logger = new Logger(OrderHttpJwtGuard.name);

    constructor(
        private readonly orderRepo: OrderRepo,
        private readonly invitationRepo: WorkshopInvitationRepo,
    ) {
        super();
    }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        Logger.debug({ message: `${OrderHttpJwtGuard.name} active` });
        // Run the JWT AuthGuard first
        const authed = await super.canActivate(ctx);
        if (!authed) return false;

        if (ctx.getType() !== 'http') return true;
        const req = ctx.switchToHttp().getRequest<Request>();
        const body = (req.body ?? {}) as AnyPayload;

        // Get req.user from strategy and normalize principal on the body
        const user = req.user as Principal | undefined;

        this.logger.verbose({
            message: `Authorization request for ${ctx.getClass().name}#${ctx.getHandler().name} from ${user?.actorName} id=${user?.id}`,
            meta: {
                path: req.url,
                method: req.method,
                actorId: user?.id,
                actorName: user?.actorName,
            },
        });

        if (!user?.actorName || !user?.id) {
            // Strategy didn't supply a usable user
            throw new DomainError({
                errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                details: { description: 'Invalid authenticated principal' },
            });
        }

        // Populate/override request principal
        body.principal = { actorName: user.actorName, id: user.id };

        // Validate self-claims in the payload (no lying about your own id)
        this.verifySelfClaims(body.principal, body);

        // Ownership checks (warn and pass if no orderId)
        const orderId = body.orderId;
        if (!orderId) {
            this.logger.warn({
                message: `Payload missing orderId; skipping ownership check. Are you sure the belongs here: ${req.url}?`,
                meta: {
                    path: req.url,
                    method: req.method,
                    actorName: body.principal.actorName,
                    actorId: body.principal.id,
                },
            });
            return true;
        }

        switch (body.principal.actorName) {
        
            case ActorName.Commissioner: {
                const order = await this.orderRepo.findById(orderId);

                if (!order) {
                    throw new DomainError({
                        errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                        details: { description: 'Order not found or forbidden', orderId },
                    });
                }

                assertBelongsTo(body.principal, order);
                return true;
            }

           
            case ActorName.Workshop: {
                const workshopId = body.workshopId ?? body.principal.id;

                if (!workshopId) {
                    throw new DomainError({
                        errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                        details: {
                            description: 'Missing workshopId for workshop principal',
                        },
                    });
                }

                const invitation = await this.invitationRepo.findById(orderId, workshopId);

                if (!invitation) {
                    throw new DomainError({
                        errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                        details: {
                            description: 'Invitation not found or forbidden',
                            orderId,
                            workshopId,
                        },
                    });
                }

                assertBelongsTo(body.principal, invitation);
                return true;
            }

         
            default:
                throw new DomainError({
                    errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                    details: {
                        description: `Unsupported actor type: ${body.principal.actorName}`,
                        orderId,
                    },
                });
        }

    }

    private verifySelfClaims(principal: Principal, payload: AnyPayload): void {
        const field = ActorEntityFieldMap[principal.actorName];
        if (!field) {
            this.logger.warn({
                message: `No entity field mapping for actorName ${principal.actorName}; skipping self-claim verification`,
                meta: { actorName: principal.actorName },
            });
            return;
        }

        const claimed = payload[field];
        if (!claimed) {
            this.logger.warn({
                message: `Payload missing self-claim field '${String(field)}'; skipping self-claim verification`,
                meta: { field: String(field), actorName: principal.actorName },
            });
            return;
        }

        if (claimed !== principal.id) {
            throw new DomainError({
                errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
                details: {
                    description: `Payload field '${String(field)}' does not match the principal`,
                    expected: principal.id,
                    actual: claimed,
                },
            });
        }
        return;
    }
}
