import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareApplication } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface SubscriptionWire {
  id: string;
  status: string;
  vendorAdmins: { employeeId: string; employeeCode: string; role: string; working: boolean }[];
  ownerAccountEmail: string | null;
  adminNote: string | null;
  vendorAdminsBelowMinimum: boolean;
  ownerAccountEmailMissing: boolean;
}

/**
 * X-IT.5 (`QĐ-110k`, `QĐ-110u`, `R-53`, SPEC P19, T-IT): a subscription of a plan that needs admins at the vendor (K2, or K4 with an admin console) is
 * not activated, nor its pool made, while the profile of the plan names fewer than two different IT Admins; a K4 plan with no console is not asked;
 * reading a subscription shows who administers the plan and two flags, which a subscription older than the rule has without being blocked.
 */
describe('the vendor admins of a subscription: the gate and the read (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;
  let applicationId: string;
  let licensedId: string;

  const planOf = async (type: string, extra: object = {}, application = applicationId): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId: application,
          name: h.unique('Plan'),
          provisioningType: type,
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
          ...extra,
        })
        .expect(201),
    ).id;
  const complete = (planId: string, extra: object = {}) => ({
    planId,
    kind: 'TERM',
    unitPrice: { amount: '1000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    commitmentTermMonths: 1,
    startDate: '2026-01-05',
    purchasedQuantity: 10,
    ...extra,
  });
  const declare = (body: object) => request(h.server()).post('/api/v1/subscriptions').set(h.as(h.it1)).send(body);
  const read = async (id: string) =>
    h.dataOf<SubscriptionWire>(
      await request(h.server()).get(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).expect(200),
    );
  const putProfile = (planId: string, extra: object = {}) =>
    request(h.server())
      .put(`/api/v1/plans/${planId}/workspace-profile`)
      .set(h.as(h.it1))
      .send({
        primaryOwnerEmployeeId: h.it1.employeeId,
        members: [
          { employeeId: h.it1.employeeId, role: 'OWNER' },
          { employeeId: it2.employeeId, role: 'ADMIN' },
        ],
        ...extra,
      });

  beforeAll(async () => {
    await h.start();
    it2 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN' });
    licensedId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Licensed app'),
      kind: 'LICENSED',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    applicationId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Vendor app'),
      kind: 'SAAS',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('activating (QĐ-110k)', () => {
    it('refuses a K2 plan with no profile: 422 SUBSCRIPTION.VENDOR_ADMINS_REQUIRED, nothing is written', async () => {
      const planId = await planOf('K2');
      const before = await h.count('subscriptions');

      const refused = await declare(complete(planId)).expect(422);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.VENDOR_ADMINS_REQUIRED');
      expect(h.detailsOf(refused)).toEqual({ planId, given: 0, required: 2 });
      expect(await h.count('subscriptions')).toBe(before);
    });

    it('lets the draft be saved, refuses to make it active while the profile is short, and activates it once the profile names two IT Admins', async () => {
      const planId = await planOf('K2');
      const draft = h.dataOf<SubscriptionWire>(
        await declare({ planId, kind: 'TERM', purchasedQuantity: 10 }).expect(201),
      );
      expect(draft.status).toBe('DRAFT');
      const whole = {
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        commitmentTermMonths: 1,
        startDate: '2026-01-05',
      };
      const patch = () => request(h.server()).patch(`/api/v1/subscriptions/${draft.id}`).set(h.as(h.it1)).send(whole);

      const refused = await patch().expect(422);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.VENDOR_ADMINS_REQUIRED');
      expect((await read(draft.id)).status).toBe('DRAFT');
      await putProfile(planId).expect(200);
      expect(h.dataOf<SubscriptionWire>(await patch().expect(200)).status).toBe('ACTIVE');
    });

    it('creates the pool of a K2 plan with two IT Admins', async () => {
      const planId = await planOf('K2');
      await putProfile(planId, { ownerAccountEmail: 'it-saas@acme.vn' }).expect(200);

      const created = h.dataOf<SubscriptionWire>(await declare(complete(planId)).expect(201));

      expect(created.status).toBe('ACTIVE');
    });

    it('asks nothing of a K4 plan with no admin console (201), and asks it of one with (422 until the profile is whole)', async () => {
      const bare = await planOf('K4', {}, licensedId);
      expect(
        h.dataOf<SubscriptionWire>(
          await declare(
            complete(bare, { kind: 'PERPETUAL', billingCycle: undefined, commitmentTermMonths: undefined }),
          ).expect(201),
        ).status,
      ).toBe('ACTIVE');

      const withConsole = await planOf('K4', { hasAdminConsole: true }, licensedId);
      const refused = await declare(
        complete(withConsole, { kind: 'PERPETUAL', billingCycle: undefined, commitmentTermMonths: undefined }),
      ).expect(422);
      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.VENDOR_ADMINS_REQUIRED');
      await putProfile(withConsole).expect(200);
      await declare(
        complete(withConsole, { kind: 'PERPETUAL', billingCycle: undefined, commitmentTermMonths: undefined }),
      ).expect(201);
    });

    it('asks nothing of a K1 plan', async () => {
      const planId = await planOf('K1');

      await declare(complete(planId, { ownerDepartmentId: h.seed.departmentId })).expect(201);
    });
  });

  describe('reading (QĐ-110u): who administers the plan, and two flags that never refuse', () => {
    it('shows the admins with their roles and whether they work, the email and the note, and no flag when all is in order', async () => {
      const planId = await planOf('K2');
      await putProfile(planId, { ownerAccountEmail: 'it-saas@acme.vn', adminNote: 'Hóa đơn gửi về kế toán' }).expect(
        200,
      );
      const created = h.dataOf<SubscriptionWire>(await declare(complete(planId)).expect(201));

      const view = await read(created.id);

      expect(view.vendorAdmins.map((admin) => [admin.employeeId, admin.role, admin.working]).sort()).toEqual(
        [
          [h.it1.employeeId, 'OWNER', true],
          [it2.employeeId, 'ADMIN', true],
        ].sort(),
      );
      expect(view).toMatchObject({
        ownerAccountEmail: 'it-saas@acme.vn',
        adminNote: 'Hóa đơn gửi về kế toán',
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
    });

    it('flags the email missing, and the admins below two when one of them has left; the subscription still reads and changes', async () => {
      const planId = await planOf('K2');
      await putProfile(planId).expect(200);
      const created = h.dataOf<SubscriptionWire>(await declare(complete(planId)).expect(201));
      expect((await read(created.id)).ownerAccountEmailMissing).toBe(true);

      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [it2.employeeId]);
      try {
        const view = await read(created.id);

        expect(view.vendorAdminsBelowMinimum).toBe(true);
        expect(view.vendorAdmins.find((admin) => admin.employeeId === it2.employeeId)?.working).toBe(false);
        await request(h.server())
          .patch(`/api/v1/subscriptions/${created.id}`)
          .set(h.as(h.it1))
          .send({ purchasedQuantity: 11 })
          .expect(200);
      } finally {
        await h.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [it2.employeeId]);
      }
    });

    it('answers a subscription older than the rule (no profile) with no admins and both flags, and does not block it', async () => {
      const planId = await planOf('K2');
      await putProfile(planId).expect(200);
      const created = h.dataOf<SubscriptionWire>(await declare(complete(planId)).expect(201));
      await h.ctx.sql.query('DELETE FROM plan_workspace_profiles WHERE plan_id = $1', [planId]);

      const view = await read(created.id);

      expect(view).toMatchObject({
        status: 'ACTIVE',
        vendorAdmins: [],
        vendorAdminsBelowMinimum: true,
        ownerAccountEmailMissing: true,
      });
      await request(h.server())
        .patch(`/api/v1/subscriptions/${created.id}`)
        .set(h.as(h.it1))
        .send({ purchasedQuantity: 12 })
        .expect(200);
    });

    it('X-IT-O4 (SPEC P19): shows Finance neither who administers the plan nor the email and the note, only the two flags', async () => {
      const planId = await planOf('K2');
      await putProfile(planId, { ownerAccountEmail: 'it-saas@acme.vn', adminNote: 'Hóa đơn gửi về kế toán' }).expect(
        200,
      );
      const created = h.dataOf<SubscriptionWire>(await declare(complete(planId)).expect(201));
      const asFinance = (path: string) => request(h.server()).get(path).set(h.as(h.finance)).expect(200);

      const one = h.dataOf<SubscriptionWire>(await asFinance(`/api/v1/subscriptions/${created.id}`));
      const page = h.dataOf<{ items: SubscriptionWire[] }>(await asFinance(`/api/v1/subscriptions?planId=${planId}`));

      for (const view of [one, page.items.find((item) => item.id === created.id) as SubscriptionWire]) {
        expect(view).toMatchObject({
          vendorAdmins: [],
          ownerAccountEmail: null,
          adminNote: null,
          vendorAdminsBelowMinimum: false,
          ownerAccountEmailMissing: false,
        });
      }
      // The IT Admin still sees all of it.
      const mine = await read(created.id);
      expect(mine.vendorAdmins).toHaveLength(2);
      expect(mine.ownerAccountEmail).toBe('it-saas@acme.vn');
    });

    it('is quiet for a plan that needs no admins: empty list, no email, no flag', async () => {
      const planId = await planOf('K1');
      const created = h.dataOf<SubscriptionWire>(
        await declare(complete(planId, { ownerDepartmentId: h.seed.departmentId })).expect(201),
      );

      expect(await read(created.id)).toMatchObject({
        vendorAdmins: [],
        ownerAccountEmail: null,
        adminNote: null,
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
    });
  });
});
