import { ActorName } from '../enums/actor.enum';

// Map ActorName to entity field
export const ActorEntityFieldMap: Record<ActorName, string> = {
  [ActorName.Commissioner]: 'commissionerId',
  [ActorName.Workshop]: 'workshopId',
};
