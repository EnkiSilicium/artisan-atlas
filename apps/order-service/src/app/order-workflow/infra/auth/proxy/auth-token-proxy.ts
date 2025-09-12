// order-auth-guard.proxy.ts
import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AUTH_GUARD } from 'auth';

import type { CanActivate } from '@nestjs/common';

/**
 * Proxy to trigger DI injection in '@UseGuards()'.
 *
 *
 */
@Injectable()
export class OrderAuthGuardProxy implements CanActivate {
  constructor(@Inject(AUTH_GUARD) private readonly inner: CanActivate) {}
  canActivate(ctx: ExecutionContext) {
    return this.inner.canActivate(ctx);
  }
}
