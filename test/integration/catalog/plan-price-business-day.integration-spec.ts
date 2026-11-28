import request from 'supertest';
import { addDays, businessDateAt } from '../../../src/core/business-date';
import { pretendBusinessToday } from '../../support/pretend-today';
import { type Person, RequestHarness } from '../../support/request-harness';
import { lineWorld } from '../../support/w3-lines-world';

/**
 * Post wave 3: a period or line "still prices its plan today" by the day of the organization (`organizations.time_zone`), not by the UTC day.
 * Between 00:00 and 07:00 in Vietnam the UTC day is still yesterday: a line closed on that UTC day has ended for the organization already.
 * The organization is one day ahead of UTC in these cases (the worst hour of the zone), whatever the clock of the machine says.
 */
const h = new RequestHarness();
/** The day of the organization now (the zone of the installation): a person is placed from it, so the days below never fall before it. */
const lastDay = businessDateAt(new Date(), 'Asia/Ho_Chi_Minh');
const dayAfter = addDays(lastDay, 1);

describe('the price of a plan is the one of the line serving the day of the organization (integration, real PostgreSQL)', () => {
  let designer: Person;

  const priceOf = async (
    planId: string,
    businessToday: string,
  ): Promise<{ status: string; missingReason: string | null }> => {
    const spy = pretendBusinessToday(h.ctx.app, businessToday);
    try {
      const res = await request(h.server())
        .get(`/api/v1/requestable-plans/${planId}`)
        .set(h.as(designer.account))
        .expect(200);

      return h.dataOf<{ price: { status: string; missingReason: string | null } }>(res).price;
    } finally {
      spy.mockRestore();
    }
  };

  beforeAll(async () => {
    await h.start();
    const design = await h.departmentWithUnit('P-PBD');
    designer = await h.staff(design, 'PBD-E1');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices a plan by a line closed on the UTC day while that line is the last day of service, and not once the organization is a day past it', async () => {
    const w = await lineWorld(h.ctx.sql);
    const { vendorId, workspaceId } = await w.vendor('LineDay');
    const planId = await w.plan(vendorId, 'Line Day Plan');
    const period = await w.period(planId, workspaceId);
    await w.line(period, workspaceId, planId, { closedOn: lastDay, closedReason: 'ENDED' });

    expect(await priceOf(planId, lastDay)).toEqual({ status: 'PRICED', missingReason: null });
    expect(await priceOf(planId, dayAfter)).toEqual({
      status: 'MISSING',
      missingReason: 'NO_PRICED_SUBSCRIPTION',
    });
  });

  it('prices a plan by a period with no line that ends on the UTC day while that is its last day, and not once the organization is a day past it', async () => {
    const w = await lineWorld(h.ctx.sql);
    const { vendorId, workspaceId } = await w.vendor('PeriodDay');
    const planId = await w.plan(vendorId, 'Period Day Plan');
    await w.period(planId, workspaceId, { endDate: lastDay });

    expect(await priceOf(planId, lastDay)).toEqual({ status: 'PRICED', missingReason: null });
    expect(await priceOf(planId, dayAfter)).toEqual({
      status: 'MISSING',
      missingReason: 'NO_PRICED_SUBSCRIPTION',
    });
  });
});
