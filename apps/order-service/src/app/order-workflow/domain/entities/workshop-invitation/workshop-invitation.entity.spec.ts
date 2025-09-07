// apps/order-service/modules/order-workflow/domain/__tests__/workshopInvitation.entity.spec.ts

import { WorkshopInvitation } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity';
import { makeWorkshopInvitation as makeWorkshopInvitationFactory } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.entity.mock-factory';
import { WorkshopInvitationStatus } from 'apps/order-service/src/app/order-workflow/domain/entities/workshop-invitation/workshop-invitation.enum';
import 'reflect-metadata';

describe('WorkshopInvitation (domain entity)', () => {
  // ---------------- helpers ----------------
  const uuid = (n = 1) =>
    `${n.toString().padStart(8, '0')}-1111-4111-8111-11111111111${n}`;

  const makeWorkshopInvitation = (seed?: Partial<WorkshopInvitation>) =>
    makeWorkshopInvitationFactory({
      orderId: seed?.orderId ?? uuid(1),
      workshopId: seed?.workshopId ?? uuid(2),
      status: seed?.status ?? WorkshopInvitationStatus.Pending,
      createdAt: seed?.createdAt ?? new Date().toISOString(),
      lastUpdatedAt: (seed as any)?.lastUpdatedAt,
    });

  // ---------------- constructor ----------------
  describe('constructor', () => {
    it('sets defaults (Pending status)', () => {
      const o = new WorkshopInvitation({
        orderId: uuid(1),
        workshopId: uuid(2),
      });
      expect(o.orderId).toBe(uuid(1));
      expect(o.workshopId).toBe(uuid(2));
      expect(o.status).toBe(WorkshopInvitationStatus.Pending);
      // If entity uses lastEditedAt internally, align your constructor to set lastUpdatedAt too.
    });

    it('throws if IDs are not UUIDs', () => {
      expect(
        () => new WorkshopInvitation({ orderId: '123', workshopId: uuid(2) }),
      ).toThrow();
      expect(
        () => new WorkshopInvitation({ orderId: uuid(2), workshopId: '123' }),
      ).toThrow();
    });
  });

  // ---------------- accept ----------------
  describe('accept', () => {
    it('from Pending populates details and moves to Accepted', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      const payload = {
        description: 'Laser engraving and varnish',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        budget: '120.00 USD',
      };

      o.accept(payload);

      expect(o.status).toBe(WorkshopInvitationStatus.Accepted);
      expect(o.description).toBe(payload.description);
      expect(o.deadline).toBe(payload.deadline);
      expect(o.budget).toBe(payload.budget);
    });

    it('throws if not in Pending', () => {
      const accepted = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      const declined = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Declined,
      });

      expect(() =>
        accepted.accept({
          description: 'x',
          deadline: new Date().toISOString(),
          budget: '1',
        }),
      ).toThrow();

      expect(() =>
        declined.accept({
          description: 'x',
          deadline: new Date().toISOString(),
          budget: '1',
        }),
      ).toThrow();
    });

    // validation-breaking scenarios (rely on assertValid + decorators)
    it('rejects empty description', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      expect(() =>
        o.accept({
          description: '',
          deadline: new Date(Date.now() + 60000).toISOString(),
          budget: '100',
        }),
      ).toThrow();
    });

    // it('rejects non-ISO deadline', () => {
    //   const o = makeWorkshopInvitation({
    //     status: WorkshopInvitationStatus.Pending,
    //   });
    //   expect(() =>
    //     o.accept({ description: 'ok', deadline: 'not-a-date', budget: '100' }),
    //   ).toThrow();
    // });

    it('rejects empty budget', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      expect(() =>
        o.accept({
          description: 'ok',
          deadline: new Date(Date.now() + 60000).toISOString(),
          budget: '',
        }),
      ).toThrow();
    });

    it('rejects wrong budget type (non-string)', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });

      expect(() =>
        o.accept({
          description: 'ok',
          deadline: new Date().toISOString(),
          // @ts-expect-error intentionally wrong type for test
          budget: 123,
        }),
      ).toThrow();
    });

    it('rejects payload with missing fields', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      // @ts-expect-error intentionally incomplete
      expect(() => o.accept({ description: 'only-desc' })).toThrow();
    });
  });

  // ---------------- confirm ----------------
  describe('confirm', () => {
    it('from Accepted moves to Confirmed', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.confirm();
      expect(o.status).toBe(WorkshopInvitationStatus.Confirmed);
    });

    it('throws if not in Accepted', () => {
      const p = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      const d = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Declined,
      });
      expect(() => p.confirm()).toThrow();
      expect(() => d.confirm()).toThrow();
    });
  });

  // ---------------- decline ----------------
  describe('decline', () => {
    it('from Pending moves to Declined', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      o.decline();
      expect(o.status).toBe(WorkshopInvitationStatus.Declined);
    });

    it('throws if not in Pending', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      expect(() => o.decline()).toThrow();
    });
  });

  // ---------------- editBudget ----------------
  describe('editBudget', () => {
    it('allowed when Accepted', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.budget = '100';
      o.editBudget('150');
      expect(o.budget).toBe('150');
    });

    it('throws when not Accepted', () => {
      const p = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      const c = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Confirmed,
      });
      expect(() => p.editBudget('200')).toThrow();
      expect(() => c.editBudget('200')).toThrow();
    });

    it('rejects empty budget', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.budget = '100';
      expect(() => o.editBudget('')).toThrow();
    });

    it('rejects non-string budget', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      // @ts-expect-error wrong type on purpose
      expect(() => o.editBudget(123)).toThrow();
    });
  });

  // ---------------- editDescription ----------------
  describe('editDescription', () => {
    it('allowed when Accepted', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.description = 'old';
      o.editDescription('new desc');
      expect(o.description).toBe('new desc');
    });

    it('throws when not Accepted', () => {
      const p = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      const c = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Confirmed,
      });
      expect(() => p.editDescription('nope')).toThrow();
      expect(() => c.editDescription('nope')).toThrow();
    });

    it('rejects empty description', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.description = 'old';
      expect(() => o.editDescription('')).toThrow();
    });

    it('rejects non-string description', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      // @ts-expect-error wrong type on purpose
      expect(() => o.editDescription(42)).toThrow();
    });
  });

  // ---------------- editDeadline ----------------
  describe('editDeadline', () => {
    it('allowed when Accepted', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
      o.deadline = new Date().toISOString();
      o.editDeadline(nextWeek);
      expect(o.deadline).toBe(nextWeek);
    });

    it('throws when not Accepted', () => {
      const p = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Pending,
      });
      const c = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Confirmed,
      });
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
      expect(() => p.editDeadline(nextWeek)).toThrow();
      expect(() => c.editDeadline(nextWeek)).toThrow();
    });

    // it('rejects non-ISO deadline', () => {
    //   const o = makeWorkshopInvitation({
    //     status: WorkshopInvitationStatus.Accepted,
    //   });
    //   o.deadline = new Date().toISOString();
    //   expect(() => o.editDeadline('not-a-date')).toThrow();
    // });

    it('rejects empty deadline', () => {
      const o = makeWorkshopInvitation({
        status: WorkshopInvitationStatus.Accepted,
      });
      o.deadline = new Date().toISOString();
      expect(() => o.editDeadline('')).toThrow();
    });
  });
});
