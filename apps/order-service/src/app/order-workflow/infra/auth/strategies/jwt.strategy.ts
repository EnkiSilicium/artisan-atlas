// apps/order-service/src/app/order-workflow/infra/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Principal } from 'auth';
import { DomainError, ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ActorName } from 'auth';


// Shape of the JWT payload you mint upstream
export type JwtPayload = {
  sub: string; // subject = actor id
  actorName: ActorName; // "commissioner" | "workshop"
  jti?: string; // token id
  iat?: number;
  exp?: number;
  // any extra claims you want (scopes, tenant, etc.)
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: extractKey([process.env.JWT_PUBLIC_KEY]),
      algorithms: ['RS256'],
      audience: process.env.JWT_AUD ?? undefined,
      issuer: process.env.JWT_ISS ?? undefined,
    });
  }

  // Return value becomes req.user
  async validate(payload: JwtPayload): Promise<Principal> {
    // Minimal sanity
    if (!payload?.sub || !payload?.actorName) {
      throw new DomainError({
        errorObject: OrderDomainErrorRegistry.byCode.FORBIDDEN,
        details: {
          message: "Incorrect JWT shape - no 'sub' or 'actorName",
          sub: payload?.sub,
          actorName: payload?.actorName,
        },
      });
    }

    //trick to return extra fields while guarding existing ones
    return (<Principal>{
      actorName: payload.actorName,
      id: payload.sub,
      tokenId: payload.jti,
      claims: payload,
    }) satisfies Principal;
  }
}

function extractKey(possibleKeys: Array<string | undefined>) {
  const filtered = <string[]>(
    possibleKeys.filter((key: string | undefined) => key)
  );

  if (!filtered.length) {
    throw new ProgrammerError({
      errorObject: ProgrammerErrorRegistry.byCode.BUG,
      details: { message: `JWT key undefined!` },
    });
  }

  return filtered[0];
}
