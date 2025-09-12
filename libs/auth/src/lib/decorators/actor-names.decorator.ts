import { SetMetadata } from '@nestjs/common';

import type { ActorName } from '../enums/actor.enum';

export const ACTOR_NAMES_KEY = 'actorNames';
export const ActorNames = (...actors: ActorName[]) =>
  SetMetadata(ACTOR_NAMES_KEY, actors);
