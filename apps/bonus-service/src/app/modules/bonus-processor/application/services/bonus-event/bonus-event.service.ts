import { randomUUID } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
import { BonusEventProcessCommand } from 'apps/bonus-service/src/app/modules/bonus-processor/application/services/bonus-event/bonus-event.command';
import { AdditiveBonus } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/additive-bonus.entity';
import { GradePolicy } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/additive-bonus/grade.policy';
import { BonusEventEntity } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.entity';
import { BonusEventRegistry } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/common/bonus-event.registy';
import { VipProfile } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.entity';
import { VipProfileRegistry } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/vip-profile.registry';
import { WindowAlgoRegistry } from 'apps/bonus-service/src/app/modules/bonus-processor/domain/aggregates/vip-profile/window-algo.registry';
import { AdditiveBonusRepo } from 'apps/bonus-service/src/app/modules/bonus-processor/infra/persistence/repositories/additive-bonus/additive-bonus.repo';
import { BonusEventRepo } from 'apps/bonus-service/src/app/modules/bonus-processor/infra/persistence/repositories/bonus-event/bonus-event.repo';
import { VipProfileRepo } from 'apps/bonus-service/src/app/modules/bonus-processor/infra/persistence/repositories/vip-profile/vip-profile.repo';
import { GradeAttainedEventV1, VipAccquiredEventV1 } from 'contracts';
import { enqueueOutbox, TypeOrmUoW } from 'persistence';
import { isoNow } from 'shared-kernel';

@Injectable()
export class BonusEventService {
  constructor(
    private readonly uow: TypeOrmUoW,
    private readonly additiveBonusRepo: AdditiveBonusRepo,
    private readonly bonusEventRepo: BonusEventRepo,
    private readonly vipProfileRepo: VipProfileRepo,
  ) {}
  async process(cmd: BonusEventProcessCommand) {
    return this.uow.runWithRetry({}, async () => {
      let additiveBonusProfile: AdditiveBonus | null =
        await this.additiveBonusRepo.findByCommissionerId(cmd.commissionerId);
      if (!additiveBonusProfile) {
        additiveBonusProfile = new AdditiveBonus({
          commissionerId: cmd.commissionerId,
          gradePolicy: GradePolicy,
          bonusRegistry: BonusEventRegistry,
        });
        await this.additiveBonusRepo.insert(additiveBonusProfile);
      }

      const event = new BonusEventEntity({
        eventId: cmd.eventId,
        commissionerId: cmd.commissionerId,
        injestedAt: cmd.injestedAt,
        eventName: cmd.eventName,
      });

      await this.bonusEventRepo.insert(event);

      let vipProfile: VipProfile | null =
        await this.vipProfileRepo.findByCommissionerId(cmd.commissionerId);
      if (!vipProfile) {
        vipProfile = new VipProfile({
          commissionerId: cmd.commissionerId,
          windowAlgoRegistry: WindowAlgoRegistry,
          vipProfileRegistry: VipProfileRegistry,
          bonusRegistry: BonusEventRegistry,
        });

        await this.vipProfileRepo.insert(vipProfile);
      }

      const { gradeChanged } = additiveBonusProfile.processBonusEvent(
        event.eventName,
        BonusEventRegistry,
        GradePolicy,
      );

      const { vipGained } = vipProfile.processBonusEvent(
        {
          commissionerId: event.commissionerId,
          eventName: event.eventName,
          eventId: event.eventId,
        },
        WindowAlgoRegistry,
        VipProfileRegistry,
        BonusEventRegistry,
      );

      await this.vipProfileRepo.update(vipProfile);

      await this.additiveBonusRepo.update(additiveBonusProfile);

      Logger.verbose({
        message: `Finished processing ${event.eventName}`,
        meta: {
          vipGained,
          gradeChanged,
          grade: additiveBonusProfile.grade
        }
      })

      if (vipGained) {
        const vipGainedPayload: VipAccquiredEventV1 = {
          eventName: 'VipAccquired',
          accquiredAt: isoNow(),
          commissionerId: vipProfile.commissionerId,
          schemaV: 1,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...vipGainedPayload,
          },
        });
      }

      if (gradeChanged) {
        const gradeAttainedPayload: GradeAttainedEventV1 = {
          eventName: 'GradeAttained',
          attainedAt: isoNow(),
          commissionerId: vipProfile.commissionerId,
          schemaV: 1,
          grade: additiveBonusProfile.grade,
        };
        enqueueOutbox({
          id: randomUUID(),
          createdAt: isoNow(),
          payload: {
            ...gradeAttainedPayload,
          },
        });
      }
    });
  }
}
