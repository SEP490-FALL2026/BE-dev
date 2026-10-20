import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProvisioningHarness } from '../support/provisioning-harness';

const h = new ProvisioningHarness();

interface Blockers {
  assignments: { assignmentId: string; employeeId: string; employeeCode: string | null; planName: string }[];
  subscriptions: { subscriptionId: string; planId: string; endDate: string | null }[];
}

describe('the retirement of an application over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let a1Employee: string;
  let people: string[];
  let owner: string;

  const confirm = (applicationId: string, body: object, account = h.it1) =>
    request(h.server())
      .post(`/api/v1/applications/${applicationId}/retirement-confirmations`)
      .set(h.as(account))
      .send(body);
  const retire = (applicationId: string, account = h.it1) =>
    request(h.server()).post(`/api/v1/applications/${applicationId}/retire`).set(h.as(account));
  const retirement = (applicationId: string, account = h.it1) =>
    request(h.server()).get(`/api/v1/applications/${applicationId}/retirement`).set(h.as(account));
  const applicationOf = async (planId: string): Promise<string> =>
    (await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId]))
      .rows[0].application_id;
  const statusOf = async (applicationId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ catalog_status: string }>(`SELECT catalog_status FROM applications WHERE id = $1`, [
        applicationId,
      ])
    ).rows[0].catalog_status;
  const taskCount = async (): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM provisioning_tasks`)).rows[0].n);
  const subscribe = async (planId: string, extra: object) =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/subscriptions')
        .set(h.as(h.it1))
        .send({
          planId,
          kind: 'TERM',
          purchasedQuantity: 5,
          unitPrice: { amount: '1000000', currency: 'VND' },
          billingCycle: 'MONTHLY',
          startDate: '2025-01-05',
          ...extra,
        })
        .expect(201),
    ).id;
  const insertAssignment = async (
    employeeId: string,
    planId: string,
    subscriptionId: string | null,
    options: { from?: string; until?: string | null; failed?: boolean } = {},
  ) => {
    const id = randomUUID();
    const from = options.from ?? '2026-10-01';
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, valid_until, failed_at,
         created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, 'ACTUAL', $8, $9, $10)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        from,
        options.failed ? from : (options.until ?? null),
        options.failed ? new Date() : null,
        randomUUID(),
      ],
    );

    return id;
  };
  /** An application with one K2 plan and a term subscription that ended last year. */
  const cleanApplication = async () => {
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId: await applicationOf(await h.plan('K2')),
          name: h.unique('Team'),
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        })
        .expect(201),
    ).id;
    const applicationId = await applicationOf(planId);
    const subscriptionId = await subscribe(planId, { endDate: '2025-12-31' });

    return { applicationId, planId, subscriptionId };
  };

  beforeAll(async () => {
    await h.start();
    owner = h.businessOwner;
    designer = await h.jobTitle('Designer');
    a1Employee = await h.person('E-A1');
    await h.account('E-A1', a1Employee, ['IT_ADMIN']);
    await h.department('P-DES', a1Employee);
    people = [];
    for (let index = 0; index < 6; index += 1) people.push(await h.member('P-DES', `E-R${index}`, designer));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-04-01 AC-8: needs the confirmation of the Business Owner, which is recorded with its content, and then retires', async () => {
    const { applicationId } = await cleanApplication();
    const before = await retirement(applicationId).expect(200);

    expect(h.codeOf(await retire(applicationId).expect(422))).toBe('APPLICATION.RETIREMENT_NEEDS_CONFIRMATION');
    expect(h.dataOf<{ retirement: { confirmed: boolean; canRetire: boolean } }>(before).retirement).toMatchObject({
      confirmed: false,
      canRetire: false,
    });
    for (const body of [{ businessOwnerEmployeeId: owner }, { businessOwnerEmployeeId: owner, note: '  ' }]) {
      expect(h.codeOf(await confirm(applicationId, body).expect(422))).toBe('APPLICATION.RETIREMENT_NOTE_REQUIRED');
    }
    expect(
      h.codeOf(await confirm(applicationId, { businessOwnerEmployeeId: people[0], note: 'tôi đồng ý' }).expect(422)),
    ).toBe('APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER');
    expect(await statusOf(applicationId)).toBe('APPROVED');

    const confirmation = h.dataOf<{
      confirmation: { id: string; businessOwnerEmployeeId: string; note: string; recordedBy: string };
    }>(
      await confirm(applicationId, { businessOwnerEmployeeId: owner, note: '  đã dọn sạch, đồng ý ngừng  ' }).expect(
        201,
      ),
    ).confirmation;
    expect(confirmation).toMatchObject({
      businessOwnerEmployeeId: owner,
      note: 'đã dọn sạch, đồng ý ngừng',
      recordedBy: h.it1.appUserId,
    });
    expect(
      h.dataOf<{ retirement: { canRetire: boolean } }>(await retirement(applicationId).expect(200)).retirement
        .canRetire,
    ).toBe(true);

    expect(h.dataOf<{ status: string }>(await retire(applicationId).expect(200)).status).toBe('RETIRED');
    expect(await statusOf(applicationId)).toBe('RETIRED');
    const events = (await h.auditEvents('Application', applicationId)).filter((event) =>
      /RETIREMENT_CONFIRMED|RETIRED/.test(event.action),
    );
    expect(events.map((event) => event.action)).toEqual(['APPLICATION.RETIREMENT_CONFIRMED', 'APPLICATION.RETIRED']);
    expect(events[0]).toMatchObject({
      actor_app_user_id: h.it1.appUserId,
      after: { businessOwnerEmployeeId: owner, note: 'đã dọn sạch, đồng ý ngừng', confirmationId: confirmation.id },
    });
    expect(events[1]).toMatchObject({
      actor_app_user_id: h.it1.appUserId,
      after: { status: 'RETIRED', confirmationId: confirmation.id, businessOwnerEmployeeId: owner },
    });
  });

  it('does not count the confirmation of someone who is no longer the Business Owner', async () => {
    const { applicationId } = await cleanApplication();
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);
    await request(h.server())
      .patch(`/api/v1/applications/${applicationId}`)
      .set(h.as(h.it1))
      .send({ businessOwnerEmployeeId: people[0] })
      .expect(200);

    expect(h.codeOf(await retire(applicationId).expect(422))).toBe('APPLICATION.RETIREMENT_NEEDS_CONFIRMATION');
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'vẫn tôi' }).expect(422);
    await confirm(applicationId, { businessOwnerEmployeeId: people[0], note: 'tôi là người mới' }).expect(201);
    await retire(applicationId).expect(200);
  });

  it('US-04-01 AC-9: is refused while assignments and a running subscription hold it, lists exactly them, and revokes nothing', async () => {
    const { applicationId, planId } = await cleanApplication();
    const running = await subscribe(planId, { endDate: '2027-12-31' });
    const first = await insertAssignment(people[0], planId, running);
    const second = await insertAssignment(people[1], planId, running);
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);
    const tasks = await taskCount();

    const refused = await retire(applicationId).expect(409);

    expect(h.codeOf(refused)).toBe('APPLICATION.RETIREMENT_BLOCKED');
    const details = h.detailsOf(refused) as unknown as Blockers;
    expect(details.assignments.map((item) => item.assignmentId).sort()).toEqual([first, second].sort());
    expect(details.assignments[0]).toMatchObject({ employeeCode: expect.stringMatching(/^E-R/) as string });
    expect(details.subscriptions.map((item) => item.subscriptionId)).toEqual([running]);
    expect(await statusOf(applicationId)).toBe('APPROVED');
    expect(await taskCount()).toBe(tasks);
    const open = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM license_assignments WHERE plan_id = $1 AND valid_until IS NULL`,
      [planId],
    );
    expect(Number(open.rows[0].n)).toBe(2);
    expect(
      h.dataOf<{ retirement: { blockers: Blockers } }>(await retirement(applicationId).expect(200)).retirement.blockers,
    ).toMatchObject({
      subscriptions: [{ subscriptionId: running }],
    });
  });

  it('US-04-01 AC-9: an internal application with one assignment and no subscription is blocked by that assignment alone', async () => {
    const planId = await h.plan('K5');
    const applicationId = await applicationOf(planId);
    const assignmentId = await insertAssignment(people[2], planId, null);
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);

    const refused = await retire(applicationId).expect(409);

    expect(h.codeOf(refused)).toBe('APPLICATION.RETIREMENT_BLOCKED');
    const details = h.detailsOf(refused) as unknown as Blockers;
    expect(details.assignments.map((item) => item.assignmentId)).toEqual([assignmentId]);
    expect(details.subscriptions).toEqual([]);
  });

  it('US-04-01 AC-14: a perpetual purchase never holds an application, and needs no liquidation first', async () => {
    const applicationId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/applications')
        .set(h.as(h.it1))
        .send({
          name: h.unique('Office'),
          kind: 'LICENSED',
          vendorName: h.unique('Vendor'),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: owner,
          communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
        })
        .expect(201),
    ).id;
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId,
          name: h.unique('Office 2021'),
          provisioningType: 'K4',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        })
        .expect(201),
    ).id;
    await request(h.server())
      .post('/api/v1/subscriptions')
      .set(h.as(h.it1))
      .send({
        planId,
        kind: 'PERPETUAL',
        purchasedQuantity: 50,
        unitPrice: { amount: '500000', currency: 'VND' },
        startDate: '2026-03-15',
      })
      .expect(201);
    const assignmentId = await insertAssignment(people[3], planId, null, { from: '2026-04-01' });
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý ngừng Office 2021' }).expect(201);

    const refused = await retire(applicationId).expect(409);
    expect(h.codeOf(refused)).toBe('APPLICATION.RETIREMENT_BLOCKED');
    expect((h.detailsOf(refused) as unknown as Blockers).assignments.map((item) => item.assignmentId)).toEqual([
      assignmentId,
    ]);
    expect((h.detailsOf(refused) as unknown as Blockers).subscriptions).toEqual([]);

    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = $2 WHERE id = $1`, [assignmentId, h.today()]);
    await retire(applicationId).expect(200);
    expect(await statusOf(applicationId)).toBe('RETIRED');
  });

  it('does not hold an application with an assignment that failed or ended, or a term that ran out; it holds one that ends today or never', async () => {
    const { applicationId, planId, subscriptionId } = await cleanApplication();
    await insertAssignment(people[0], planId, subscriptionId, { failed: true });
    await insertAssignment(people[1], planId, subscriptionId, { from: '2025-02-01', until: '2025-03-01' });
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);
    const view = h.dataOf<{ retirement: { blockers: Blockers; canRetire: boolean } }>(
      await retirement(applicationId).expect(200),
    );
    expect(view.retirement.blockers).toEqual({ assignments: [], subscriptions: [] });

    const today = await subscribe(planId, { endDate: h.today() });
    const openEnded = await subscribe(planId, {});

    const refused = await retire(applicationId).expect(409);

    expect(
      (h.detailsOf(refused) as unknown as Blockers).subscriptions.map((item) => item.subscriptionId).sort(),
    ).toEqual([today, openEnded].sort());
  });

  it('retires once and for good: a second retirement, a new confirmation and a way back are all refused', async () => {
    const { applicationId } = await cleanApplication();
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);
    await retire(applicationId).expect(200);

    expect(h.codeOf(await retire(applicationId).expect(409))).toBe('APPLICATION.ALREADY_RETIRED');
    expect(h.codeOf(await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'lại' }).expect(409))).toBe(
      'APPLICATION.ALREADY_RETIRED',
    );
    await expect(
      h.ctx.sql.query(`UPDATE applications SET catalog_status = 'APPROVED', retired_at = NULL WHERE id = $1`, [
        applicationId,
      ]),
    ).rejects.toThrow(/never brought back/);
  });

  it('takes no seat under a retired application, from a request or from a baseline file', async () => {
    const planId = await h.plan('K5');
    const applicationId = await applicationOf(planId);
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);
    await retire(applicationId).expect(200);

    const grant = await h.grant({ requestId: h.gate.grantable(people[4], planId) }).expect(409);
    const baseline = await h
      .upload({ planId }, h.file([{ employee_code: 'E-R5', account_identifier: 'e-r5@acme.vn' }]))
      .expect(409);

    expect(h.codeOf(grant)).toBe('SEAT_TARGET.APPLICATION_RETIRED');
    expect(h.codeOf(baseline)).toBe('SEAT_TARGET.APPLICATION_RETIRED');
  });

  it('a grant and a retirement at the same moment never leave a retired application with a seat held under it', async () => {
    const planId = await h.plan('K5');
    const applicationId = await applicationOf(planId);
    await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'đồng ý' }).expect(201);

    const [granted, retired] = await Promise.all([
      h.grant({ requestId: h.gate.grantable(people[5], planId) }),
      retire(applicationId),
    ]);

    const held = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM license_assignments WHERE plan_id = $1 AND failed_at IS NULL AND valid_until IS NULL`,
      [planId],
    );
    expect(Number(held.rows[0].n) > 0 && (await statusOf(applicationId)) === 'RETIRED').toBe(false);
    expect([granted.status, retired.status]).not.toEqual([201, 200]);
  });

  it('is for the IT Admin to record and retire; Finance only looks; an employee and the Super Admin do neither', async () => {
    const { applicationId } = await cleanApplication();
    const superAdmin = { ...h.it1, accessToken: h.admin };

    for (const account of [h.finance, h.employee, superAdmin]) {
      expect(
        h.codeOf(await confirm(applicationId, { businessOwnerEmployeeId: owner, note: 'x' }, account).expect(403)),
      ).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await retire(applicationId, account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    await retirement(applicationId, h.finance).expect(200);
    await retirement(applicationId, h.employee).expect(403);
    expect(await statusOf(applicationId)).toBe('APPROVED');
    expect(h.codeOf(await retire(randomUUID()).expect(404))).toBe('APPLICATION.NOT_FOUND');
    expect(h.codeOf(await retirement(randomUUID()).expect(404))).toBe('APPLICATION.NOT_FOUND');
    expect(a1Employee).toBeDefined();
  });
});
