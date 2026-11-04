import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { waitForLockWaiters } from '../../support/lock-wait';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

describe('the guards of the seats of a subscription over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let a1Employee: string;
  let people: string[];

  const patch = (subscriptionId: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).send(body);
  const quantityOf = async (subscriptionId: string): Promise<number | null> =>
    h.dataOf<{ purchasedQuantity: number | null }>(
      await request(h.server()).get(`/api/v1/subscriptions/${subscriptionId}`).set(h.as(h.it1)).expect(200),
    ).purchasedQuantity;
  /** An assignment written straight to the table, for a person and a subscription, from a day to a day. */
  const insertAssignment = async (
    employeeId: string,
    planId: string,
    subscriptionId: string | null,
    options: { from?: string; until?: string | null; failed?: boolean; db?: Pick<Client, 'query'> } = {},
  ): Promise<string> => {
    const id = randomUUID();
    const from = options.from ?? '2026-10-01';
    await (options.db ?? h.ctx.sql).query(
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

  beforeAll(async () => {
    await h.start();
    designer = await h.jobTitle('Designer');
    a1Employee = await h.person('E-A1');
    await h.account('E-A1', a1Employee, 'IT_ADMIN');
    await h.department('P-DES', a1Employee);
    people = [];
    for (let index = 0; index < 14; index += 1) people.push(await h.member('P-DES', `E-G${index}`, designer));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-04-03 AC-5: the number of seats cannot go under the assignments that hold one, tasks waiting or failed included', async () => {
    const subscriptionId = await h.subscription(10, 'K2');
    const planId = await h.planOf(subscriptionId);
    const queued = await h.granted(people[0], planId, { subscriptionId });
    const running = await h.granted(people[1], planId, { subscriptionId });
    await h.claim(running.id).expect(200);
    const failed = await h.granted(people[2], planId, { subscriptionId });
    await h.claim(failed.id).expect(200);
    await h.fail(failed.id, { reason: 'could not be done' }).expect(200);
    for (const person of people.slice(3, 8)) await insertAssignment(person, planId, subscriptionId);
    expect(queued.status).toBe('QUEUED');

    const refused = await patch(subscriptionId, { purchasedQuantity: 6 }).expect(422);

    expect(h.codeOf(refused)).toBe('SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED');
    expect(h.detailsOf(refused)).toEqual({ occupied: 8, requested: 6 });
    expect(await quantityOf(subscriptionId)).toBe(10);
    expect((await h.auditEvents('Subscription', subscriptionId)).map((event) => event.action)).not.toContain(
      'SUBSCRIPTION.UPDATED',
    );
    await patch(subscriptionId, { purchasedQuantity: 8 }).expect(200);
    await patch(subscriptionId, { purchasedQuantity: 12 }).expect(200);
    await patch(subscriptionId, { billingCycle: 'ANNUAL' }).expect(200);
    expect(await quantityOf(subscriptionId)).toBe(12);
  });

  it('does not count an assignment that failed, one that ended, or one of another subscription', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const planId = await h.planOf(subscriptionId);
    await insertAssignment(people[0], planId, subscriptionId);
    await insertAssignment(people[1], planId, subscriptionId);
    await insertAssignment(people[2], planId, subscriptionId, { failed: true });
    await insertAssignment(people[3], planId, subscriptionId, { from: '2026-02-01', until: '2026-03-01' });
    // A grant that failed before its start day: its empty period lies in the future, and it holds nothing.
    await insertAssignment(people[5], planId, subscriptionId, { from: '2027-05-01', failed: true });
    const other = await h.subscription(5, 'K2');
    await insertAssignment(people[4], await h.planOf(other), other);

    expect(h.detailsOf(await patch(subscriptionId, { purchasedQuantity: 1 }).expect(422))).toEqual({
      occupied: 2,
      requested: 1,
    });
    await patch(subscriptionId, { purchasedQuantity: 2 }).expect(200);
  });

  it('counts an assignment that begins later, which will hold its seat from that day', async () => {
    const subscriptionId = await h.subscription(5, 'K2');
    const planId = await h.planOf(subscriptionId);
    await insertAssignment(people[0], planId, subscriptionId, { from: '2027-03-01' });

    expect(h.detailsOf(await patch(subscriptionId, { purchasedQuantity: 0 }).expect(422))).toMatchObject({
      occupied: 1,
    });
  });

  it('lets a subscription with no seats bought yet have them set, with nothing to compare', async () => {
    const subscriptionId = await h.subscription(null, 'K2');

    await patch(subscriptionId, { purchasedQuantity: 5 }).expect(200);

    expect(await quantityOf(subscriptionId)).toBe(5);
  });

  it('US-04-03 AC-5: a grant and a cut of the seats at the same moment never leave more assignments than seats', async () => {
    const subscriptionId = await h.subscription(2, 'K2');
    const planId = await h.planOf(subscriptionId);
    await insertAssignment(people[0], planId, subscriptionId);

    const answers = await Promise.all([
      h.grant({ requestId: h.gate.grantable(people[1], planId), subscriptionId }),
      patch(subscriptionId, { purchasedQuantity: 1 }),
    ]);

    const rows = await h.ctx.sql.query<{ held: string; seats: number }>(
      `SELECT (SELECT count(*) FROM license_assignments WHERE subscription_id = $1) AS held,
              (SELECT purchased_quantity FROM subscriptions WHERE id = $1) AS seats`,
      [subscriptionId],
    );
    expect(Number(rows.rows[0].held)).toBeLessThanOrEqual(rows.rows[0].seats);
    expect(answers.map((answer) => answer.status).sort()).not.toEqual([201, 200]);
  });

  it('US-04-03 AC-5: a cut of the seats waits for a grant that is being made, and then counts it', async () => {
    const subscriptionId = await h.subscription(2, 'K2');
    const planId = await h.planOf(subscriptionId);
    await insertAssignment(people[0], planId, subscriptionId);
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    try {
      // The grant in flight: it holds the subscription and has written its assignment, which is not committed yet.
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM subscriptions WHERE id = $1 FOR UPDATE', [subscriptionId]);
      await insertAssignment(people[1], planId, subscriptionId, { db: holder });

      const pending = patch(subscriptionId, { purchasedQuantity: 1 }).then((response) => response);
      await waitForLockWaiters(h.ctx.sql, 1);
      await holder.query('COMMIT');
      const refused = await pending;

      expect(refused.status).toBe(422);
      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED');
      expect(h.detailsOf(refused)).toEqual({ occupied: 2, requested: 1 });
      expect(await quantityOf(subscriptionId)).toBe(2);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
    }
  });

  it('US-04-03 AC-6: a draft takes no seat, from a request or from a baseline file, and says what it lacks', async () => {
    const draft = await h.draftSubscription('K2');
    const planId = await h.planOf(draft);

    const grant = await h.grant({ requestId: h.gate.grantable(people[0], planId), subscriptionId: draft }).expect(422);
    const baseline = await h
      .upload({ subscriptionId: draft }, h.file([{ employee_code: 'E-G1', account_identifier: 'e-g1@acme.vn' }]))
      .expect(422);

    for (const response of [grant, baseline]) {
      expect(h.codeOf(response)).toBe('SEAT_TARGET.SUBSCRIPTION_DRAFT');
      expect(h.detailsOf(response)).toEqual({ missing: ['START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE'] });
    }
    const written = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM license_assignments WHERE subscription_id = $1`,
      [draft],
    );
    expect(Number(written.rows[0].n)).toBe(0);
    expect(h.dataOf<{ items: unknown[] }>(await h.list().expect(200)).items).toBeDefined();
  });

  it('takes a seat as soon as the draft is complete, and a plan with no subscription is never a draft', async () => {
    const draft = await h.draftSubscription('K2');
    const planId = await h.planOf(draft);
    await patch(draft, {
      unitPrice: { amount: '500000', currency: 'VND' },
      startDate: '2026-01-05',
      billingCycle: 'MONTHLY',
    }).expect(200);

    const task = await h.granted(people[0], planId, { subscriptionId: draft });
    const internal = await h.granted(people[1], await h.plan('K5'));

    expect(task.status).toBe('QUEUED');
    expect(internal.subscriptionId).toBeNull();
  });

  describe('US-04-02 AC-9: the suggestion to consider a K2 plan, which blocks nothing', () => {
    const makeSoftware = async () => {
      const k1Plan = await h.planOf(await h.subscription(20, 'K1'));
      const applicationId = (
        await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [k1Plan])
      ).rows[0].application_id;
      const otherPlan = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/plans')
          .set(h.as(h.it1))
          .send({
            applicationId,
            name: h.unique('Team'),
            provisioningType: 'K1',
            pricingModel: 'PER_SEAT',
            controlLevel: 'FULL',
          })
          .expect(201),
      ).id;
      const k2Plan = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/plans')
          .set(h.as(h.it1))
          .send({
            applicationId,
            name: h.unique('Business'),
            provisioningType: 'K2',
            pricingModel: 'PER_SEAT',
            controlLevel: 'FULL',
          })
          .expect(201),
      ).id;

      return { applicationId, k1Plan, otherPlan, k2Plan };
    };
    const recommendations = async (applicationId: string) =>
      h.dataOf<{ recommendations: { code: string; k1Holders: number; threshold: number }[] }>(
        await request(h.server()).get(`/api/v1/applications/${applicationId}`).set(h.as(h.it1)).expect(200),
      ).recommendations;

    it('shows it from three different people on K1 plans of the software, and not before', async () => {
      const software = await makeSoftware();
      await insertAssignment(people[0], software.k1Plan, null);
      await insertAssignment(people[1], software.otherPlan, null);

      expect(await recommendations(software.applicationId)).toEqual([]);

      await insertAssignment(people[2], software.k1Plan, null);

      expect(await recommendations(software.applicationId)).toEqual([
        { code: 'CONSIDER_K2', k1Holders: 3, threshold: 3 },
      ]);
    });

    it('counts people, not assignments, and leaves out what ended, failed or sits on a K2 plan', async () => {
      const software = await makeSoftware();
      await insertAssignment(people[0], software.k1Plan, null);
      await insertAssignment(people[0], software.otherPlan, null);
      await insertAssignment(people[1], software.k1Plan, null);
      await insertAssignment(people[1], software.k1Plan, null, { failed: true, from: '2027-05-01' });
      await insertAssignment(people[2], software.k1Plan, null, { from: '2026-02-01', until: '2026-03-01' });
      await insertAssignment(people[3], software.k2Plan, null);
      await insertAssignment(people[4], software.k2Plan, null);

      expect(await recommendations(software.applicationId)).toEqual([]);
    });

    it('is a hint only: saving and granting go on as usual', async () => {
      const software = await makeSoftware();
      for (const person of people.slice(0, 4)) await insertAssignment(person, software.k1Plan, null);
      expect((await recommendations(software.applicationId))[0]).toMatchObject({ k1Holders: 4 });

      await request(h.server())
        .patch(`/api/v1/applications/${software.applicationId}`)
        .set(h.as(h.it1))
        .send({ dataSensitivity: 'MEDIUM' })
        .expect(200);
      const subscriptionId = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(h.as(h.it1))
          .send({
            ownerDepartmentId: h.seed.departmentId,
            planId: software.otherPlan,
            kind: 'TERM',
            purchasedQuantity: 5,
            unitPrice: { amount: '1000000', currency: 'VND' },
            billingCycle: 'MONTHLY',
            startDate: '2026-01-05',
          })
          .expect(201),
      ).id;
      const task = await h.granted(people[5], software.otherPlan, { subscriptionId });
      expect(task.status).toBe('QUEUED');
    });

    it('says nothing for software with no K1 plan', async () => {
      const k2Only = await h.planOf(await h.subscription(5, 'K2'));
      const applicationId = (
        await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [k2Only])
      ).rows[0].application_id;

      expect(await recommendations(applicationId)).toEqual([]);
    });
  });
});
