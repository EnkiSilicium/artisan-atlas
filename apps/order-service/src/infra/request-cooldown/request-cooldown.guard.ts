import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActorName, assertIsPrincipalObject, Principal } from 'auth';
import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { RequestControlRepository } from './request-control.repository';
import {
  REQUEST_COOLDOWN_CONFIG,
  type RequestCooldownConfig,
} from './request-cooldown-config.token';

@Injectable()
export class RequestCooldownGuard implements CanActivate {
  constructor(
    private readonly repo: RequestControlRepository,
    @Inject(REQUEST_COOLDOWN_CONFIG)
    private readonly cfg: RequestCooldownConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const candidate = req.body?.principal;
    if (!candidate) return true;
    try {
      assertIsPrincipalObject(candidate);
    } catch {
      return true;
    }
    if (candidate.actorName !== ActorName.Commissioner) return true;
    const principal: Principal = candidate;

    const key = `order-init:${principal.id}`;
    const allowed = await this.repo.tryAcquire(key, this.cfg.ttlSeconds);
    if (allowed) return true;

    const ttl = await this.repo.ttlMs(key);
    if (ttl !== null) {
      res.setHeader('Retry-After', Math.ceil(ttl / 1000));
    }

    throw new DomainError({
      errorObject: OrderDomainErrorRegistry.byCode.TOO_MANY_REQUESTS,
    });
  }
}

