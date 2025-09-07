import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { ActorEntityFieldMap, ActorName, Principal } from 'auth';

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    Logger.warn({
      message: `WARNING: auth disabled!`,
    });

    if (ctx.getType() !== 'http') return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const body = req.body ?? {};

    for (const [actorName, field] of Object.entries(ActorEntityFieldMap) as [
      ActorName,
      string,
    ][]) {
      const id = (body as any)[field];
      if (typeof id === 'string') {
        const principal: Principal = { actorName, id };
        (body as any).principal = principal;
        (req as any).user = principal;
        break;
      }
    }

    return true;
  }
}
