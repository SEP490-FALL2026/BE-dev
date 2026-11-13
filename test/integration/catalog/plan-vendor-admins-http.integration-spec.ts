import request from 'supertest';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { declareApplication } from '../../support/builders/catalog.builder';
import type { ApiAccount } from '../../support/api-accounts';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();
const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

interface ProfileWire {
  primaryOwner: { employeeId: string };
  members: { employeeId: string; role: string }[];
  ownerAccountEmail: string | null;
  adminNote: string | null;
}

/**
 * X-IT.4b (`QĐ-110k`, `QĐ-110u`, `R-53`, SPEC P19, T-IT): the workspace profile of a plan the company administers at the vendor (a K2 plan, or a K4
 * plan with an admin console) keeps the email of the company account that owns it there and a note, and names at least two different IT Admins who
 * work now; a plan that needs no admins at the vendor has no profile. Over HTTP on real PostgreSQL.
 */
describe('the vendor admins of a plan: the workspace profile (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;
  let finance: ApiAccount;
  let applicationId: string;

  const planOf = async (type: string, extra: object = {}): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId,
          name: h.unique('Plan'),
          provisioningType: type,
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
          ...extra,
        })
        .expect(201),
    ).id;
  const profile = (extra: object = {}, members?: { employeeId: string; role: string }[]) => ({
    primaryOwnerEmployeeId: h.it1.employeeId,
    members: members ?? [
      { employeeId: h.it1.employeeId, role: 'OWNER' },
      { employeeId: it2.employeeId, role: 'ADMIN' },
    ],
    ...extra,
  });
  const put = (planId: string, body: object) =>
    request(h.server()).put(`/api/v1/plans/${planId}/workspace-profile`).set(h.as(h.it1)).send(body);

  beforeAll(async () => {
    await h.start();
    it2 = await buildActivatedAccount(h.ctx, h.seed, { code: 'E-IT2', email: 'it2@acme.vn', role: 'IT_ADMIN' });
    finance = h.finance;
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

  it('records the email of the company account and the note with two IT Admins of a K2 plan, and shows them', async () => {
    const planId = await planOf('K2');

    const stored = h.dataOf<ProfileWire>(
      await put(
        planId,
        profile({ ownerAccountEmail: 'it-saas@acme.vn', adminNote: 'Hóa đơn gửi về kế toán, gia hạn tháng 12' }),
      ).expect(200),
    );

    expect(stored).toMatchObject({
      ownerAccountEmail: 'it-saas@acme.vn',
      adminNote: 'Hóa đơn gửi về kế toán, gia hạn tháng 12',
    });
    const detail = h.dataOf<{ workspaceProfile: ProfileWire }>(
      await request(h.server()).get(`/api/v1/plans/${planId}`).set(h.as(h.it1)).expect(200),
    );
    expect(detail.workspaceProfile.ownerAccountEmail).toBe('it-saas@acme.vn');
    expect(JSON.stringify(detail)).not.toMatch(/password/i);
  });

  it('takes the email and the note as optional, and clears them with null', async () => {
    const planId = await planOf('K2');
    expect(h.dataOf<ProfileWire>(await put(planId, profile()).expect(200))).toMatchObject({
      ownerAccountEmail: null,
      adminNote: null,
    });
    await put(planId, profile({ ownerAccountEmail: 'it-saas@acme.vn', adminNote: 'x' })).expect(200);

    expect(
      h.dataOf<ProfileWire>(await put(planId, profile({ ownerAccountEmail: null, adminNote: null })).expect(200)),
    ).toMatchObject({ ownerAccountEmail: null, adminNote: null });
  });

  it('refuses an email that is not one, a note over 2000 characters, and a field the profile does not have, with 422', async () => {
    const planId = await planOf('K2');

    for (const extra of [
      { ownerAccountEmail: 'not-an-email' },
      { adminNote: 'x'.repeat(2001) },
      { ownerAccountPassword: 'secret' },
    ]) {
      const refused = await put(planId, profile(extra)).expect(422);
      expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
    }
  });

  it('needs at least two different IT Admins: one is 422 PLAN.VENDOR_ADMINS_INVALID, and nothing is written', async () => {
    const planId = await planOf('K2');
    const alone = profile({}, [{ employeeId: h.it1.employeeId, role: 'OWNER' }]);

    const refused = await put(planId, alone).expect(422);

    expect(h.codeOf(refused)).toBe('PLAN.VENDOR_ADMINS_INVALID');
    expect(h.detailsOf(refused)).toEqual({ given: 1, required: 2 });
    const { rowCount } = await h.ctx.sql.query('SELECT 1 FROM plan_workspace_profiles WHERE plan_id = $1', [planId]);
    expect(rowCount).toBe(0);
  });

  it('keeps the rule on who may be named: a person who is not an IT Admin who works is refused first', async () => {
    const planId = await planOf('K2');

    const refused = await put(
      planId,
      profile({}, [
        { employeeId: h.it1.employeeId, role: 'OWNER' },
        { employeeId: finance.employeeId, role: 'ADMIN' },
      ]),
    ).expect(422);

    expect(h.codeOf(refused)).toBe('PLAN.WORKSPACE_PERSON_INVALID');
  });

  it('gives a K4 plan with an admin console a profile like a K2 plan’s, and refuses one with a single admin', async () => {
    const planId = await planOf('K4', { hasAdminConsole: true });

    await put(planId, profile({ ownerAccountEmail: 'it-saas@acme.vn' })).expect(200);
    const alone = await put(planId, profile({}, [{ employeeId: h.it1.employeeId, role: 'OWNER' }])).expect(422);

    expect(h.codeOf(alone)).toBe('PLAN.VENDOR_ADMINS_INVALID');
  });

  it('gives no profile to a K4 plan with no admin console, nor to a K1 plan: 422 PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE', async () => {
    const k4 = await planOf('K4');
    const k1 = await planOf('K1');

    for (const planId of [k4, k1]) {
      const refused = await put(planId, profile()).expect(422);
      expect(h.codeOf(refused)).toBe('PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE');
    }
  });

  it('lets a K4 plan with a profile become K2 and refuses to turn it into a kind that has none', async () => {
    const planId = await planOf('K4', { hasAdminConsole: true });
    await put(planId, profile()).expect(200);

    await request(h.server())
      .patch(`/api/v1/plans/${planId}`)
      .set(h.as(h.it1))
      .send({ provisioningType: 'K2' })
      .expect(200);
    const blocked = await request(h.server())
      .patch(`/api/v1/plans/${planId}`)
      .set(h.as(h.it1))
      .send({ provisioningType: 'K1' })
      .expect(409);

    expect(h.codeOf(blocked)).toBe('PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE');
  });
});
