/* eslint-disable */
import { Injectable } from '@nestjs/common';
import { WorkshopPort } from 'apps/order-service/src/app/order-workflow/application/ports/workshop.port';

@Injectable()
export class WorkshopMockAdapter implements WorkshopPort {
  async checkWorkshopExistsMany(workshopIds: string[]): Promise<boolean> {
    workshopIds;
    return true;
  }
}
