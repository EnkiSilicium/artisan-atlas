import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActorName, assertIsPrincipalObject, Principal } from 'auth';
import { DomainError } from 'error-handling/error-core';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { InMemoryRequestControlRepository, RequestControlRepository } from '../request-cooldown/request-control.repository';
import {
  REQUEST_COOLDOWN_CONFIG,
  type RequestCooldownConfig,
} from '../request-cooldown/request-cooldown-config.token';

@Injectable()
export class RequestCooldownGuard implements CanActivate {
  constructor(
    @Inject(REQUEST_COOLDOWN_CONFIG)
    private readonly cfg: RequestCooldownConfig,
    private readonly repo: RequestControlRepository,
    private readonly backupRepo: InMemoryRequestControlRepository
  ) { }

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

    let ttl: number | null
    let allowed: boolean
    try {
      allowed = await this.repo.tryAcquire(key, this.cfg.ttlSeconds);
      if (allowed) return true;

      ttl = await this.repo.ttlMs(key);
    } catch (error) {
      allowed = await this.backupRepo.tryAcquire(key, this.cfg.ttlSeconds);
      if (allowed) return true;
      ttl = await this.backupRepo.ttlMs(key);
    }

    if (ttl !== null) {
      res.setHeader('Retry-After', Math.ceil(ttl / 1000));
    }

    const error = new DomainError({
      errorObject: OrderDomainErrorRegistry.byCode.TOO_MANY_REQUESTS,
    });
    throw new HttpException(`Too many requests`, HttpStatus.TOO_MANY_REQUESTS)
  }
}

