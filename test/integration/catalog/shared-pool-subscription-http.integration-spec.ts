import { randomUUID } from 'node:crypto';
import { createActivatedAccount } from '../../support/api-accounts';
import { SubscriptionHttpHarness, type SubscriptionWire } from '../../support/subscription-http-harness';

interface PoolWire extends SubscriptionWire {
  commitmentTermMonths: number | null;
  responsibleItAdminEmployeeId: string | null;
  vendorMinimumSeats: number | null;
  isPrimaryForPlan: boolean;
}

/**
 * The fields a subscription of the shared pool carries (QĐ-103d(2), QĐ-103e, QĐ-103v(4), QĐ-104d(3)), over HTTP on real PostgreSQL: the
 * commitment, the K1 plan, the IT Admin who answers for it, the billing cycle that is no longer written, the minimum of the vendor,
 * and the subscription that prices its plan. What is already stored is read and changed as before, with a warning.
 */
describe('the shared-pool fields of a subscription over HTTP (integration, real PostgreSQL)', () => {
  const h = new SubscriptionHttpHarness();
  const { dataOf, codeOf, detailsOf, today, rate, plan, create, patch, get, complete, n } = h;

  const BASE = {
    kind: 'TERM',
    purchasedQuantity: 5,
    unitPrice: { amount: '10.00', currency: 'USD' },
    startDate: '2026-03-15',
    endDate: '2027-03-14',
  };
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{
        commitment: number | null;
        responsible: string | null;
        primary: boolean;
        cycle: string | null;
      }>(
        `SELECT commitment_term_months AS commitment, responsible_it_admin_employee_id AS responsible,
                is_primary_for_plan AS "primary", billing_cycle AS cycle FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
  }, 120000);

  // The clock the harness pretends is restored after each test, so each one sets the day its price is recorded on.
  beforeEach(async () => {
    today('2026-03-15');
    await rate('USD', '2026-03-15', '25000');
  });

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('the commitment and the billing cycle (R-G01, R-E01, Q-09)', () => {
    it('stores a year paid by the month, a year paid by the year and a month paid by the month; a perpetual purchase takes none', async () => {
      const { planId } = await plan();
      const yearByMonth = dataOf<PoolWire>(
        await create({ ...BASE, planId, billingCycle: 'MONTHLY', commitmentTermMonths: 12 }).expect(201),
      );
      const yearByYear = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(201));
      const monthByMonth = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'MONTHLY' }).expect(201));

      expect(yearByMonth).toMatchObject({ status: 'ACTIVE', billingCycle: 'MONTHLY', commitmentTermMonths: 12 });
      expect(yearByYear).toMatchObject({ status: 'ACTIVE', billingCycle: 'ANNUAL', commitmentTermMonths: 12 });
      expect(monthByMonth).toMatchObject({ status: 'ACTIVE', billingCycle: 'MONTHLY', commitmentTermMonths: 1 });
      const licensed = await plan({ kind: 'LICENSED', type: 'K4' });
      expect(
        codeOf(
          await create({
            ...BASE,
            planId: licensed.planId,
            kind: 'PERPETUAL',
            endDate: undefined,
            commitmentTermMonths: 12,
          }).expect(422),
        ),
      ).toBe('SUBSCRIPTION.COMMITMENT_TERM_NOT_ALLOWED');
    });

    it('refuses a term that becomes active with no commitment, and a month paid by the year; a draft may wait', async () => {
      const { planId } = await plan();
      const before = await n('subscriptions');

      const missing = await create({ ...BASE, planId, billingCycle: 'ANNUAL', commitmentTermMonths: undefined }).expect(
        422,
      );
      const longer = await create({ ...BASE, planId, billingCycle: 'ANNUAL', commitmentTermMonths: 1 }).expect(422);

      expect(codeOf(missing)).toBe('SUBSCRIPTION.COMMITMENT_TERM_REQUIRED');
      expect(codeOf(longer)).toBe('SUBSCRIPTION.BILLING_LONGER_THAN_COMMITMENT');
      expect(await n('subscriptions')).toBe(before);
      const draft = dataOf<PoolWire>(
        await create({ planId, kind: 'TERM', billingCycle: 'ANNUAL', commitmentTermMonths: undefined }).expect(201),
      );
      expect(draft).toMatchObject({ status: 'DRAFT', commitmentTermMonths: null });
    });

    it('R-E01: a K1 plan is for one month and paid by the month', async () => {
      const { planId } = await plan({ type: 'K1', pricing: 'FLAT_RATE' });

      expect(
        codeOf(await create({ ...BASE, planId, billingCycle: 'MONTHLY', commitmentTermMonths: 12 }).expect(422)),
      ).toBe('SUBSCRIPTION.K1_MONTHLY_ONLY');
      expect(codeOf(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(422))).toBe(
        'SUBSCRIPTION.K1_MONTHLY_ONLY',
      );
      expect(dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'MONTHLY' }).expect(201))).toMatchObject({
        status: 'ACTIVE',
        commitmentTermMonths: 1,
      });
    });

    it('Q-09: a new write names only MONTHLY or ANNUAL, and a stored quarterly cycle is read with a warning and changed as before', async () => {
      const { planId } = await plan();

      expect(codeOf(await create({ ...BASE, planId, billingCycle: 'QUARTERLY' }).expect(422))).toBe(
        'SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED',
      );
      expect(codeOf(await create({ ...BASE, planId, billingCycle: 'OTHER' }).expect(422))).toBe(
        'SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED',
      );
      const old = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(201));
      await h.ctx.sql.query(`UPDATE subscriptions SET billing_cycle = 'QUARTERLY' WHERE id = $1`, [old.id]);

      const read = dataOf<PoolWire>(await get(old.id).expect(200));
      const changed = dataOf<PoolWire>(await patch(old.id, { purchasedQuantity: 6 }).expect(200));
      const refused = await patch(old.id, { billingCycle: 'OTHER' }).expect(422);

      expect(read).toMatchObject({ billingCycle: 'QUARTERLY', warnings: ['BILLING_CYCLE_LEGACY'] });
      expect(changed).toMatchObject({ billingCycle: 'QUARTERLY', purchasedQuantity: 6 });
      expect(codeOf(refused)).toBe('SUBSCRIPTION.BILLING_CYCLE_UNSUPPORTED');
    });
  });

  describe('the IT Admin who answers for the subscription (R-E03)', () => {
    it('is needed once it is active: refused when missing, when the person is not an IT Admin who works and signs in', async () => {
      const { planId } = await plan();
      const body = { ...BASE, planId, billingCycle: 'ANNUAL' };

      expect(codeOf(await create({ ...body, responsibleItAdminEmployeeId: undefined }).expect(422))).toBe(
        'SUBSCRIPTION.RESPONSIBLE_REQUIRED',
      );
      expect(codeOf(await create({ ...body, responsibleItAdminEmployeeId: h.employee.employeeId }).expect(422))).toBe(
        'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN',
      );
      expect(codeOf(await create({ ...body, responsibleItAdminEmployeeId: randomUUID() }).expect(422))).toBe(
        'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN',
      );
      await h.ctx.sql.query(`UPDATE employees SET work_state = 'ON_LONG_LEAVE' WHERE id = $1`, [h.it1.employeeId]);
      try {
        expect(codeOf(await create(body).expect(422))).toBe('SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN');
      } finally {
        await h.ctx.sql.query(`UPDATE employees SET work_state = 'WORKING' WHERE id = $1`, [h.it1.employeeId]);
      }
      expect(dataOf<PoolWire>(await create(body).expect(201))).toMatchObject({
        status: 'ACTIVE',
        responsibleItAdminEmployeeId: h.it1.employeeId,
        warnings: [],
      });
    });

    it('is needed to complete a draft, and a draft may be given the person before it', async () => {
      const { planId } = await plan();
      // The rate of the day of the price is missing, so the subscription is a draft whatever else it holds.
      today('2026-03-16');
      const draft = dataOf<PoolWire>(
        await create({
          ...BASE,
          planId,
          startDate: '2026-03-16',
          billingCycle: 'ANNUAL',
          responsibleItAdminEmployeeId: undefined,
        }).expect(201),
      );
      expect(draft).toMatchObject({ status: 'DRAFT', missing: ['EXCHANGE_RATE'] });
      await rate('USD', '2026-03-16', '25000');

      expect(codeOf(await complete(draft.id).expect(422))).toBe('SUBSCRIPTION.RESPONSIBLE_REQUIRED');
      await patch(draft.id, { responsibleItAdminEmployeeId: h.it1.employeeId }).expect(200);
      expect(dataOf<PoolWire>(await complete(draft.id).expect(200))).toMatchObject({
        status: 'ACTIVE',
        responsibleItAdminEmployeeId: h.it1.employeeId,
      });
      today('2026-03-15');
    });

    describe('is judged again when a draft becomes active, whoever was named (F-001)', () => {
      let second: Awaited<ReturnType<typeof createActivatedAccount>>;

      beforeAll(async () => {
        second = await createActivatedAccount(h.ctx, h.seed, {
          code: 'E-IT2',
          email: 'it2@acme.vn',
          role: 'IT_ADMIN',
          admin: h.admin,
        });
      });

      /** A draft that names the second IT Admin and waits only for the rate of its price day. */
      const waitingForRate = async (day: string) => {
        const { planId } = await plan();
        today(day);
        const draft = dataOf<PoolWire>(
          await create({
            ...BASE,
            planId,
            startDate: day,
            billingCycle: 'ANNUAL',
            responsibleItAdminEmployeeId: second.employeeId,
          }).expect(201),
        );
        expect(draft).toMatchObject({ status: 'DRAFT', missing: ['EXCHANGE_RATE'] });
        await rate('USD', day, '25000');

        return draft;
      };
      const restore = async () => {
        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1`, [second.appUserId]);
        await h.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE', work_state = 'WORKING' WHERE id = $1`, [
          second.employeeId,
        ]);
      };
      const revokeRole = () =>
        h.ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'IT_ADMIN'`, [
          second.appUserId,
        ]);
      const leave = () =>
        h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED', work_state = 'LEFT' WHERE id = $1`, [
          second.employeeId,
        ]);

      it.each([
        ['lost the IT Admin role', revokeRole, '2026-03-17'],
        ['left', leave, '2026-03-19'],
      ])('refuses to complete a draft whose named person %s', async (_name, change, day) => {
        const draft = await waitingForRate(day);
        await change();
        try {
          expect(codeOf(await complete(draft.id).expect(422))).toBe('SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN');
          expect(dataOf<PoolWire>(await get(draft.id).expect(200)).status).toBe('DRAFT');
        } finally {
          await restore();
        }
        expect(dataOf<PoolWire>(await complete(draft.id).expect(200)).status).toBe('ACTIVE');
      });

      it('refuses the update that makes a draft active when the person stored lost the role', async () => {
        // A draft that waits only for the seats bought: the rate of its day is there, so naming them makes it active.
        const { planId } = await plan();
        const draft = dataOf<PoolWire>(
          await create({
            ...BASE,
            planId,
            billingCycle: 'ANNUAL',
            purchasedQuantity: undefined,
            responsibleItAdminEmployeeId: second.employeeId,
          }).expect(201),
        );
        expect(draft).toMatchObject({ status: 'DRAFT', missing: ['QUANTITY'] });
        await revokeRole();
        try {
          expect(codeOf(await patch(draft.id, { purchasedQuantity: 6 }).expect(422))).toBe(
            'SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN',
          );
        } finally {
          await restore();
        }
        expect(dataOf<PoolWire>(await patch(draft.id, { purchasedQuantity: 6 }).expect(200)).status).toBe('ACTIVE');
      });

      it('lets the person who answers be changed alone on an old K1 subscription whose cycle is no longer accepted (F-009)', async () => {
        const { planId } = await plan({ type: 'K1', pricing: 'FLAT_RATE' });
        const old = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'MONTHLY' }).expect(201));
        await h.ctx.sql.query(
          `UPDATE subscriptions SET billing_cycle = 'ANNUAL', commitment_term_months = 1, responsible_it_admin_employee_id = NULL
            WHERE id = $1`,
          [old.id],
        );

        const changed = dataOf<PoolWire>(
          await patch(old.id, { responsibleItAdminEmployeeId: h.it1.employeeId }).expect(200),
        );

        expect(changed).toMatchObject({ responsibleItAdminEmployeeId: h.it1.employeeId, billingCycle: 'ANNUAL' });
        // Naming the cycle again judges the combination as a new write would.
        expect(codeOf(await patch(old.id, { billingCycle: 'ANNUAL' }).expect(422))).toBe(
          'SUBSCRIPTION.BILLING_LONGER_THAN_COMMITMENT',
        );
      });
    });

    it('is left empty on data older than the rule: it is read and changed as before, with a warning', async () => {
      const { planId } = await plan();
      const old = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(201));
      await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = NULL WHERE id = $1`, [old.id]);

      const read = dataOf<PoolWire>(await get(old.id).expect(200));
      const changed = dataOf<PoolWire>(await patch(old.id, { purchasedQuantity: 7 }).expect(200));

      expect(read).toMatchObject({ responsibleItAdminEmployeeId: null, warnings: ['RESPONSIBLE_MISSING'] });
      expect(changed).toMatchObject({ purchasedQuantity: 7, warnings: ['RESPONSIBLE_MISSING'] });
    });
  });

  describe('the minimum of the vendor', () => {
    it('is a positive number of seats, even one above the seats bought, and can be cleared', async () => {
      const { planId } = await plan();
      const zero = await create({ ...BASE, planId, billingCycle: 'ANNUAL', vendorMinimumSeats: 0 }).expect(422);

      expect(codeOf(zero)).toBe('VALIDATION_ERROR');
      const created = dataOf<PoolWire>(
        await create({ ...BASE, planId, billingCycle: 'ANNUAL', purchasedQuantity: 3, vendorMinimumSeats: 5 }).expect(
          201,
        ),
      );
      expect(created).toMatchObject({ purchasedQuantity: 3, vendorMinimumSeats: 5 });
      expect(
        dataOf<PoolWire>(await patch(created.id, { vendorMinimumSeats: null }).expect(200)).vendorMinimumSeats,
      ).toBeNull();
      expect(codeOf(await patch(created.id, { vendorMinimumSeats: 0 }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('the subscription that prices its plan (Q-04)', () => {
    const makeTwo = async () => {
      const { planId } = await plan();
      const first = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(201));
      const second = dataOf<PoolWire>(await create({ ...BASE, planId, billingCycle: 'ANNUAL' }).expect(201));

      return { planId, first, second };
    };

    it('takes the flag off the one that had it, and one is the most there is', async () => {
      const { first, second } = await makeTwo();

      expect(dataOf<PoolWire>(await patch(first.id, { isPrimaryForPlan: true }).expect(200)).isPrimaryForPlan).toBe(
        true,
      );
      expect(dataOf<PoolWire>(await patch(second.id, { isPrimaryForPlan: true }).expect(200)).isPrimaryForPlan).toBe(
        true,
      );

      expect((await stored(first.id)).primary).toBe(false);
      expect((await stored(second.id)).primary).toBe(true);
      // The one that lost the flag has the change in its own history (F-005).
      const release = (await h.auditOf(first.id)).find(
        (event) =>
          event.action === 'SUBSCRIPTION.UPDATED' && JSON.stringify(event.after) === '{"isPrimaryForPlan":false}',
      );
      expect(release?.before).toEqual({ isPrimaryForPlan: true });
    });

    it('leaves exactly one primary when two are set at the same moment, and never a 500', async () => {
      const { planId, first, second } = await makeTwo();

      const [a, b] = await Promise.all([
        patch(first.id, { isPrimaryForPlan: true }),
        patch(second.id, { isPrimaryForPlan: true }),
      ]);

      expect([a.status, b.status].every((status) => status === 200 || status === 409)).toBe(true);
      const primaries = await h.ctx.sql.query(
        `SELECT 1 FROM subscriptions WHERE plan_id = $1 AND is_primary_for_plan`,
        [planId],
      );
      expect(primaries.rowCount).toBe(1);
    });

    it('is refused to a draft and to a period a later one continues', async () => {
      const { planId, first } = await makeTwo();
      const draft = dataOf<PoolWire>(await create({ planId, kind: 'TERM' }).expect(201));
      // A period that continues `first`, written the way a renewal writes it: the link is set when the row is made.
      await h.ctx.sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, owner_department_id, renewed_from_id, start_date, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'TERM', $3, $4, '2027-03-15', now())`,
        [h.seed.organizationId, planId, h.seed.departmentId, first.id],
      );

      const notActive = await patch(draft.id, { isPrimaryForPlan: true }).expect(422);
      const renewed = await patch(first.id, { isPrimaryForPlan: true }).expect(422);

      expect(codeOf(notActive)).toBe('SUBSCRIPTION.PRIMARY_NOT_ELIGIBLE');
      expect(detailsOf(notActive)).toEqual({ reason: 'NOT_ACTIVE' });
      expect(detailsOf(renewed)).toEqual({ reason: 'ALREADY_RENEWED' });
    });
  });
});
