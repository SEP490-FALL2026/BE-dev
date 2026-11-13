import request from 'supertest';
import { declareApplication } from '../../support/builders/catalog.builder';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface PlanWire {
  id: string;
  provisioningType: string;
  hasAdminConsole: boolean;
}

/**
 * X-IT.4a (`R-53`, SPEC P29, `QĐ-110k`): a K4 plan says whether the company administers it through a console of the vendor (the flag decides
 * whether it needs two admins there); no other kind may say it, and the row itself refuses the flag on any other kind. Over HTTP on real PostgreSQL.
 */
describe('the flag "has an admin console" of a plan (integration, real PostgreSQL)', () => {
  const body = (applicationId: string, type: string, extra: object = {}) => ({
    applicationId,
    name: h.unique('Plan'),
    provisioningType: type,
    pricingModel: 'PER_SEAT',
    controlLevel: 'FULL',
    ...extra,
  });
  const declare = (payload: object) => request(h.server()).post('/api/v1/plans').set(h.as(h.it1)).send(payload);
  const patch = (id: string, payload: object) =>
    request(h.server()).patch(`/api/v1/plans/${id}`).set(h.as(h.it1)).send(payload);
  const read = async (id: string) =>
    h.dataOf<PlanWire>(await request(h.server()).get(`/api/v1/plans/${id}`).set(h.as(h.it1)).expect(200));
  let licensed: string;
  let saas: string;

  beforeAll(async () => {
    await h.start();
    licensed = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Licensed'),
      kind: 'LICENSED',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
    saas = await declareApplication(h.ctx, h.it1.accessToken, {
      name: h.unique('Saas'),
      kind: 'SAAS',
      vendorName: h.unique('Vendor'),
      dataSensitivity: 'LOW',
      communication: NO,
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('is false for every plan that does not say it, and shown on the plan and in the list', async () => {
    const created = h.dataOf<PlanWire>(await declare(body(licensed, 'K4')).expect(201));

    expect(created.hasAdminConsole).toBe(false);
    const listed = h.dataOf<{ items: PlanWire[] }>(
      await request(h.server()).get('/api/v1/plans').set(h.as(h.it1)).expect(200),
    );
    expect(listed.items.find((plan) => plan.id === created.id)?.hasAdminConsole).toBe(false);
  });

  it('lets a K4 plan say it on declaring and on a change, either way', async () => {
    const created = h.dataOf<PlanWire>(await declare(body(licensed, 'K4', { hasAdminConsole: true })).expect(201));
    expect(created.hasAdminConsole).toBe(true);

    expect(h.dataOf<PlanWire>(await patch(created.id, { hasAdminConsole: false }).expect(200)).hasAdminConsole).toBe(
      false,
    );
    expect((await read(created.id)).hasAdminConsole).toBe(false);
    expect(h.dataOf<PlanWire>(await patch(created.id, { hasAdminConsole: true }).expect(200)).hasAdminConsole).toBe(
      true,
    );
  });

  it.each(['K1', 'K2'])(
    'refuses a %s plan that gives the flag, true or false, with 422 and writes nothing',
    async (type) => {
      for (const hasAdminConsole of [true, false]) {
        const refused = await declare(body(saas, type, { hasAdminConsole })).expect(422);
        expect(h.codeOf(refused)).toBe('PLAN.ADMIN_CONSOLE_NOT_APPLICABLE');
      }
      const named = h.unique('Named');
      await declare(body(saas, type, { name: named, hasAdminConsole: true })).expect(422);
      const { rowCount } = await h.ctx.sql.query('SELECT 1 FROM plans WHERE name = $1', [named]);
      expect(rowCount).toBe(0);
    },
  );

  it('refuses the flag on a change of a plan that is not K4, and a plan that stops being K4 loses it', async () => {
    const k2 = h.dataOf<PlanWire>(await declare(body(saas, 'K2')).expect(201));
    expect(h.codeOf(await patch(k2.id, { hasAdminConsole: true }).expect(422))).toBe(
      'PLAN.ADMIN_CONSOLE_NOT_APPLICABLE',
    );
    expect(h.codeOf(await patch(k2.id, { hasAdminConsole: false }).expect(422))).toBe(
      'PLAN.ADMIN_CONSOLE_NOT_APPLICABLE',
    );

    // A plan of an application that takes K1, K2 and K4 alike: here the licensed one takes K4 then K1.
    const k4 = h.dataOf<PlanWire>(await declare(body(licensed, 'K4', { hasAdminConsole: true })).expect(201));
    const moved = h.dataOf<PlanWire>(await patch(k4.id, { provisioningType: 'K1' }).expect(200));
    expect(moved).toMatchObject({ provisioningType: 'K1', hasAdminConsole: false });
    expect(h.codeOf(await patch(moved.id, { hasAdminConsole: true }).expect(422))).toBe(
      'PLAN.ADMIN_CONSOLE_NOT_APPLICABLE',
    );
  });

  it('is kept by the row too: a plan that is not K4 cannot be set to true by any statement', async () => {
    const k2 = h.dataOf<PlanWire>(await declare(body(saas, 'K2')).expect(201));

    await expect(
      h.ctx.sql.query('UPDATE plans SET has_admin_console = true WHERE id = $1', [k2.id]),
    ).rejects.toMatchObject({
      constraint: 'plans_admin_console_k4_only',
    });
  });
});
