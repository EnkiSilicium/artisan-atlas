// apps/order-service/src/app/order-workflow/infra/auth/strategies/jwt.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Principal } from 'auth';
import { DomainError, ProgrammerError } from 'error-handling/error-core';
import { ProgrammerErrorRegistry } from 'error-handling/registries/common';
import { OrderDomainErrorRegistry } from 'error-handling/registries/order';
import { ExtractJwt, Strategy } from 'passport-jwt';



import { assertValidJwtPayload } from '../assertions/assert-valid-jwt-payload.assertion';
import { assertJwtKeyDefined } from '../assertions/assert-jwt-key-defined.assertion';

import { ActorName } from 'auth';
import { inspect } from 'util';



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
      secretOrKey: extractKey([process.env.JWT_PUBLIC_KEY]).replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
      passReqToCallback: true,
      audience: process.env.JWT_AUD ?? undefined,
      issuer: process.env.JWT_ISS ?? undefined,
    });
  }

  // Return value becomes req.user
  async validate(req: any, payload: JwtPayload): Promise<Principal> {

    // Minimal sanity
    assertValidJwtPayload(payload);

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

  assertJwtKeyDefined(filtered);

  return filtered[0];
}
