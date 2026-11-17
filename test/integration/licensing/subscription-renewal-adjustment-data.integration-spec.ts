import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { SubscriptionRenewalRepo } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal.repo';
import type { NewRenewal } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal.types';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * The data the one-write renewal at the adjustment point stands on (SBF-20, S20-T1): the `INCREASE` choice, the two notice bases of a
 * period without a declared deadline, the role of the IT Admin in charge who decides alone, the seats the system counted, and one
 * live case per (subscription, period) instead of one per subscription. Real PostgreSQL, through the one repo that writes the table.
 */
describe('the data of a renewal at the adjustment point (integration, real PostgreSQL)', () => {
  let repo: SubscriptionRenewalRepo;
  let prisma: PrismaService;
  let organizationId: string;

  beforeAll(async () => {
    await h.start();
    repo = h.ctx.app.get(SubscriptionRenewalRepo, { strict: false });
    prisma = h.ctx.app.get(PrismaService, { strict: false });
    organizationId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const newRenewal = (subscriptionId: string, overrides: Partial<NewRenewal> = {}): NewRenewal => ({
    organizationId,
    subscriptionId,
    noticeBasis: 'BY_PAYMENT_DATE',
    noticeBaseDate: '2026-12-20',
    proposedChoice: 'INCREASE',
    proposedQuantity: 12,
    proposalNote: null,
    seatsNeeded: 12,
    proposedByEmployeeId: h.it1.employeeId,
    proposedByAppUserId: h.it1.appUserId,
    ...overrides,
  });
  const inserted = (input: NewRenewal) => prisma.$transaction((tx) => repo.insert(tx, input));

  it('keeps the INCREASE choice, the new notice bases and the seats the system counted', async () => {
    const subscriptionId = await h.term({ type: 'K2' });
    const payment = await inserted(newRenewal(subscriptionId));
    expect(payment).toMatchObject({
      proposedChoice: 'INCREASE',
      proposedQuantity: 12,
      noticeBasis: 'BY_PAYMENT_DATE',
      seatsNeeded: 12,
    });

    const renewalDate = await inserted(
      newRenewal(subscriptionId, {
        noticeBasis: 'BY_RENEWAL_DATE',
        noticeBaseDate: '2027-01-20',
        proposedChoice: 'RENEW',
        proposedQuantity: 10,
        seatsNeeded: 10,
      }),
    );
    expect(renewalDate).toMatchObject({
      noticeBasis: 'BY_RENEWAL_DATE',
      proposedChoice: 'RENEW',
      proposedQuantity: 10,
    });
  });

  it('has no count of seats on a case written before (seats_needed is null) and refuses a negative one', async () => {
    const subscriptionId = await h.term({ type: 'K2' });
    const legacy = await inserted(
      newRenewal(subscriptionId, { proposedChoice: 'CANCEL', proposedQuantity: null, seatsNeeded: null }),
    );
    expect(legacy?.seatsNeeded).toBeNull();

    await expect(
      inserted(newRenewal(subscriptionId, { noticeBaseDate: '2027-02-20', seatsNeeded: -1 })),
    ).rejects.toThrow(/subscription_renewals_seats_needed_not_negative/);
  });

  it('holds one live case per period: another period is free, the same period is not, and a STALE case frees it', async () => {
    const subscriptionId = await h.term({ type: 'K2' });
    const first = await inserted(newRenewal(subscriptionId));
    expect(first).not.toBeNull();
    expect(await inserted(newRenewal(subscriptionId))).toBeNull();
    const next = await inserted(newRenewal(subscriptionId, { noticeBaseDate: '2027-01-20' }));
    expect(next).not.toBeNull();

    const live = await repo.ofSubscriptions([subscriptionId]);
    expect(live.get(subscriptionId)?.map((renewal) => renewal.noticeBaseDate)).toEqual(['2026-12-20', '2027-01-20']);

    await prisma.$transaction((tx) => repo.closeStale(tx, first?.id ?? ''));
    expect(await inserted(newRenewal(subscriptionId))).not.toBeNull();
    const afterStale = await repo.ofSubscriptions([subscriptionId]);
    expect(afterStale.get(subscriptionId)).toHaveLength(2);
  });

  it('reads the role of the IT Admin in charge as it was written', async () => {
    const subscriptionId = await h.term({ type: 'K2' });
    const proposed = await inserted(newRenewal(subscriptionId, { proposedChoice: 'RENEW', proposedQuantity: 10 }));
    const decided = await prisma.$transaction((tx) =>
      repo.recordDecision(tx, proposed?.id ?? '', {
        choice: 'RENEW',
        quantity: 10,
        reason: null,
        decidedByEmployeeId: h.it1.employeeId,
        decidedByAppUserId: h.it1.appUserId,
        deciderRole: 'IT_ADMIN_IN_CHARGE',
        decidedAt: new Date(),
        decidedOn: '2026-12-20',
        decidedAfterDeadline: false,
        executionPoint: 'AS_PLANNED',
        activeSeatsAtDecision: 0,
        snapshot: { source: 'NOT_CONNECTED', takenAt: new Date().toISOString() },
      }),
    );

    expect(decided.decision?.deciderRole).toBe('IT_ADMIN_IN_CHARGE');
    expect((await repo.find(decided.id))?.decision?.deciderRole).toBe('IT_ADMIN_IN_CHARGE');
  });
});
