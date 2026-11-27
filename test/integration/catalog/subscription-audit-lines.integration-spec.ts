import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../../src/modules/catalog/public/subscription-period.api';
import { principalOf } from '../../support/builders/account.builder';
import { SubscriptionHttpHarness } from '../../support/subscription-http-harness';

const h = new SubscriptionHttpHarness();

interface LineWire {
  id: string;
  plan: { id: string };
}
interface PeriodWire {
  id: string;
  status: string;
  missing: string[];
  responsibleItAdminEmployeeId: string | null;
  updatedAt: string;
  lines: LineWire[];
}

const vnd = (amount: string) => ({ amount, currency: 'VND' });

/**
 * The audit of wave 3 on the subscriptions of several lines (R1, R2, R3, R4, R8, N1), real PostgreSQL: the price of a renewed period, a monthly price of
 * zero, a move of a period to a workspace that has a plan of one of its lines, the IT Admin who answers for a declared subscription, and a plan whose
 * application is retired among the lines of a period.
 */
describe('the lines of a period: renewal price, zero price, move, declarer and retired application (integration, real PostgreSQL)', () => {
  /** Plans of seats of one vendor (so one workspace holds them all) with the vendor and each application. */
  const vendorPlans = async (count: number) => {
    const vendorName = h.unique('Vendor');
    const plans: { planId: string; applicationId: string; vendorId: string | null }[] = [];
    for (let index = 0; index < count; index += 1) plans.push(await h.plan({ vendorName }));

    return { plans, vendorId: plans[0].vendorId as string };
  };
  const declareLines = (plans: { planId: string }[], prices: string[], extra: object = {}) =>
    h.create({
      kind: 'TERM',
      billingCycle: 'ANNUAL',
      startDate: '2026-03-01',
      lines: plans.map((plan, index) => ({
        planId: plan.planId,
        monthlyUnitPrice: vnd(prices[index]),
        quantity: 3 + index,
      })),
      ...extra,
    });
  const read = async (id: string) => h.dataOf<PeriodWire>(await h.get(id).expect(200));
  const periodRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        unit_price_minor: string;
        unit_price_currency: string;
        price_rate: string;
        price_reporting_minor: string;
        plan_id: string;
        monthly_unit_price_minor: string;
      }>(
        `SELECT unit_price_minor::text, unit_price_currency, price_rate::text, price_reporting_minor::text, plan_id,
                monthly_unit_price_minor::text
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const renew = async (
    period: PeriodWire,
    startDate: string,
    quantities: readonly number[] = [],
    named: 'AS_READ' | 'REVERSED' = 'AS_READ',
  ) => {
    const actor = await principalOf(h.ctx, h.it1.accessToken);

    return h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(SubscriptionPeriodApi).recordNextPeriod(tx, actor, {
        previousSubscriptionId: period.id,
        lines: (named === 'REVERSED' ? [...period.lines].reverse() : period.lines).map((line, index) => ({
          previousLineId: line.id,
          quantity: quantities[index] ?? 2,
        })),
        billingCycle: 'ANNUAL',
        startDate,
        autoRenew: true,
        allowsMidTermReduction: false,
      }),
    );
  };
  const retire = (applicationId: string) =>
    request(h.server()).post(`/api/v1/applications/${applicationId}/retire`).set(h.as(h.it1));

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterEach(() => h.afterEach());

  afterAll(async () => {
    await h.stop();
  });

  describe('R1: the price of the period a renewal of several lines continues', () => {
    it('is 12 times the monthly price of the first line for an ANNUAL period, with the snapshot of the same currency that a declaration writes', async () => {
      const { plans } = await vendorPlans(2);
      const declared = h.dataOf<PeriodWire>(
        await declareLines(plans, ['500000', '800000'], { startDate: '2025-01-01', endDate: '2025-12-31' }).expect(201),
      );
      const declaredRow = await periodRow(declared.id);

      const next = await renew(await read(declared.id), '2026-01-01');

      const row = await periodRow(next.subscriptionId);
      expect(row).toMatchObject({
        unit_price_minor: '6000000',
        unit_price_currency: 'VND',
        price_reporting_minor: '6000000',
      });
      // The rate is the one the declaration of the same price writes, not a bare 1.
      expect(row.price_rate).toBe(declaredRow.price_rate);
      const price = await h.ctx.app.get(CatalogApi).getPlanPrice(plans[0].planId);
      expect(price).toMatchObject({ monthlyPriceMinor: 500000n });
    });
  });

  describe('A-1: the first line a renewal keeps is one source for the price of the period', () => {
    it('prices the period by the second line when the first keeps no seat: 12 x 800.000, and the plan stays the plan of the period it continues', async () => {
      const { plans } = await vendorPlans(2);
      const declared = h.dataOf<PeriodWire>(
        await declareLines(plans, ['500000', '800000'], { startDate: '2025-01-01', endDate: '2025-12-31' }).expect(201),
      );

      const next = await renew(await read(declared.id), '2026-01-01', [0, 2]);

      const row = await periodRow(next.subscriptionId);
      expect(row).toMatchObject({ unit_price_minor: '9600000', plan_id: plans[0].planId });
      expect(row.monthly_unit_price_minor).toBe('800000');
    });
  });

  describe('A-1: the order of the lines of a renewed period is the order of the period before, not the order the renewal named them in', () => {
    it('prices the renewal after one that named the Premium line first by the Standard line, the first of the lines: 12 x 500.000', async () => {
      const { plans } = await vendorPlans(2);
      const declared = h.dataOf<PeriodWire>(
        await declareLines(plans, ['500000', '800000'], { startDate: '2025-01-01', endDate: '2025-12-31' }).expect(201),
      );

      const first = await renew(await read(declared.id), '2026-01-01', [], 'REVERSED');
      const second = await renew(await read(first.subscriptionId), '2027-01-01');

      expect(await periodRow(first.subscriptionId)).toMatchObject({ unit_price_minor: '6000000' });
      expect(await periodRow(second.subscriptionId)).toMatchObject({
        unit_price_minor: '6000000',
        monthly_unit_price_minor: '500000',
      });
    });
  });

  describe('R2: a monthly price of zero on a K2 term is no price', () => {
    it.each([
      ['monthlyUnitPrice', { monthlyUnitPrice: vnd('0') }],
      ['unitPrice', { unitPrice: vnd('0') }],
    ])('keeps a declaration with a %s of 0 a draft that lacks its UNIT_PRICE', async (_name, price) => {
      const { planId } = await h.plan();

      const created = h.dataOf<PeriodWire>(
        await h
          .create({
            planId,
            kind: 'TERM',
            billingCycle: 'MONTHLY',
            startDate: '2026-03-01',
            purchasedQuantity: 4,
            ...price,
          })
          .expect(201),
      );

      expect(created.status).toBe('DRAFT');
      expect(created.missing).toContain('UNIT_PRICE');
    });
  });

  describe('R3: a period of several lines moves to a workspace that has a live line of one of its plans', () => {
    it('is refused 409 SUBSCRIPTION.DUPLICATE_PLAN and nothing moves', async () => {
      const { plans, vendorId } = await vendorPlans(2);
      const period = h.dataOf<PeriodWire>(await declareLines(plans, ['500000', '800000']).expect(201));
      const otherWorkspace = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/workspaces')
          .set(h.as(h.it1))
          .send({ vendorId, name: h.unique('Second workspace') })
          .expect(201),
      ).id;
      // The second plan already has a live line in the other workspace.
      await h
        .create({
          kind: 'TERM',
          billingCycle: 'ANNUAL',
          startDate: '2026-03-01',
          workspaceId: otherWorkspace,
          lines: [{ planId: plans[1].planId, monthlyUnitPrice: vnd('900000'), quantity: 1 }],
        })
        .expect(201);
      const workspaceOf = async (id: string) =>
        (await h.ctx.sql.query<{ workspace_id: string }>(`SELECT workspace_id FROM subscriptions WHERE id = $1`, [id]))
          .rows[0].workspace_id;
      const before = await workspaceOf(period.id);

      const refused = await h.patch(period.id, { workspaceId: otherWorkspace }).expect(409);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.DUPLICATE_PLAN');
      expect(await workspaceOf(period.id)).toBe(before);
    });
  });

  describe('R4: the IT Admin who declares answers for the subscription (QĐ-118f)', () => {
    it('is the one who declared, and the declarer may add a line to the subscription they declared', async () => {
      const { plans } = await vendorPlans(3);
      const period = h.dataOf<PeriodWire>(await declareLines(plans.slice(0, 2), ['500000', '800000']).expect(201));

      expect((await read(period.id)).responsibleItAdminEmployeeId).toBe(h.it1.employeeId);
      await request(h.server())
        .post(`/api/v1/subscriptions/${period.id}/lines`)
        .set(h.as(h.it1))
        .send({
          planId: plans[2].planId,
          monthlyUnitPrice: vnd('300000'),
          expectedUpdatedAt: (await read(period.id)).updatedAt,
        })
        .expect(201);
    });

    it('refuses a body that names the IT Admin, on the old body and on lines: 422 VALIDATION_ERROR, nothing stored', async () => {
      const { plans } = await vendorPlans(2);
      const before = await h.n('subscriptions');

      const old = await h
        .create({
          planId: plans[0].planId,
          kind: 'TERM',
          purchasedQuantity: 2,
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(422);
      const lines = await declareLines(plans, ['500000', '800000'], {
        responsibleItAdminEmployeeId: h.it1.employeeId,
      }).expect(422);

      expect(h.codeOf(old)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(lines)).toBe('VALIDATION_ERROR');
      expect(await h.n('subscriptions')).toBe(before);
    });
  });

  describe('R8, N1: the application of every plan of the lines', () => {
    it('refuses a declaration with 422 SUBSCRIPTION.APPLICATION_RETIRED naming the plan whose application is retired', async () => {
      const { plans } = await vendorPlans(2);
      await retire(plans[1].applicationId).expect(200);
      const before = await h.n('subscriptions');

      const refused = await declareLines(plans, ['500000', '800000']).expect(422);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.APPLICATION_RETIRED');
      expect(h.detailsOf(refused)).toEqual({ planId: plans[1].planId });
      expect(await h.n('subscriptions')).toBe(before);
    });

    it('refuses the renewal of a period one of whose lines is of a retired application, naming the plan, and writes nothing', async () => {
      const { plans } = await vendorPlans(2);
      // An ended period holds nothing back, so the application of the second line can be retired; its line is still live when the renewal comes.
      const period = h.dataOf<PeriodWire>(
        await declareLines(plans, ['500000', '800000'], { startDate: '2025-01-01', endDate: '2025-12-31' }).expect(201),
      );
      await retire(plans[1].applicationId).expect(200);
      const before = await h.n('subscriptions');

      await expect(renew(await read(period.id), '2026-01-01')).rejects.toMatchObject({
        reason: 'APPLICATION_RETIRED',
        planId: plans[1].planId,
      });
      expect(await h.n('subscriptions')).toBe(before);
    });

    it('does not retire the application of the second line of a running period: it holds the application as a one-plan period does', async () => {
      const { plans } = await vendorPlans(2);
      const period = h.dataOf<PeriodWire>(await declareLines(plans, ['500000', '800000']).expect(201));

      const refused = await retire(plans[1].applicationId).expect(409);

      expect(h.codeOf(refused)).toBe('APPLICATION.RETIREMENT_BLOCKED');
      expect(
        (h.detailsOf(refused) as { subscriptions: { subscriptionId: string; planId: string }[] }).subscriptions,
      ).toEqual([expect.objectContaining({ subscriptionId: period.id, planId: plans[1].planId })]);
    });
  });
});
