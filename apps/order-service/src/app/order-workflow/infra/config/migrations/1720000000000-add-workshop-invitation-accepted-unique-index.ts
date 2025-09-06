import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkshopInvitationAcceptedUniqueIndex1720000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_workshop_invitation_order_accepted" ON "workshop_invitation" ("order_id") WHERE "status" = 'accepted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_workshop_invitation_order_accepted"`,
    );
  }
}
