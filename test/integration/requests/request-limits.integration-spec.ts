import request from 'supertest';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface Refused {
  status: number;
  body: { error?: { code: string; details?: Record<string, unknown> } };
}

const codeOf = (response: Refused) => response.body.error?.code;
const detailsOf = (response: Refused) => response.body.error?.details ?? {};

/**
 * The limits of a request for new access, per beneficiary, over PostgreSQL (`BR-MF1-01` GH-1/GH-2/GH-3, `QĐ-103c`, `QĐ-104b`, `QĐ-106g`,
 * `QĐ-108c`): an open request of the same plan and three open requests refuse; many paid applications ask for a reason and flag the request;
 * a request for a group is refused whole with every line that breaks a limit. The harness raises GH-2 for the other suites; this one sets it
 * back to the default of the parameter.
 */
describe('the limits of a request for new access (integration, real PostgreSQL, BR-MF1-01)', () => {
  let design: Department;
  let head: Person;
  let plans: string[];

  const person = async (code: string): Promise<Person> => h.staff(design, code);
  const open = (who: Person, planId: string, extra: Record<string, unknown> = {}) =>
    h.submit(h.form(planId, extra), who.account);
  const reject = (id: string) => h.decide(id, { decision: 'REJECT', reason: 'Not needed' }, head.account).expect(200);

  beforeAll(async () => {
    await h.start();
    await h.enforceRequestLimits();
    await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
    await h.setParameter('PAID_SOFTWARE_FLAG_THRESHOLD', 10).expect(200);
    design = await h.departmentWithUnit('P-GH');
    head = await h.staff(design, 'GH-H1');
    await h.makeHead(design, head);
    plans = [];
    for (let index = 0; index < 5; index += 1) plans.push(await h.planOf(await h.subscription(20)));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('BR-MF1-01e GH-1: a request of the same plan open', () => {
    it('refuses the second request of the plan while the first is open, naming it, and lets it through once refused', async () => {
      const e1 = await person('GH-E1');
      const first = (await open(e1, plans[0]).expect(201)).body as { data: { request: { id: string } } };

      const again = await open(e1, plans[0]).expect(409);

      expect(codeOf(again)).toBe('ACCESS_REQUEST.OPEN_REQUEST_EXISTS');
      expect(detailsOf(again)).toEqual({ requestId: first.data.request.id });

      await reject(first.data.request.id);
      await open(e1, plans[0]).expect(201);
    });
  });

  describe('BR-MF1-01f GH-2: three requests for new access open', () => {
    it('refuses the fourth with the limit and the open requests, and lets one through when one ends', async () => {
      const e2 = await person('GH-E2');
      const sent: string[] = [];
      for (const planId of plans.slice(0, 3)) {
        sent.push(((await open(e2, planId).expect(201)).body as { data: { request: { id: string } } }).data.request.id);
      }

      const fourth = await open(e2, plans[3]).expect(409);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
      expect(detailsOf(fourth)).toMatchObject({ limit: 3 });
      expect([...(detailsOf(fourth).openRequestIds as string[])].sort()).toEqual([...sent].sort());

      await reject(sent[0]);
      await open(e2, plans[3]).expect(201);
    });

    it('QĐ-104b: counts a proposal of new software and not a draft', async () => {
      const e3 = await person('GH-E3');
      await h.propose(h.proposeBody(), e3.account).expect(201);
      await open(e3, plans[0]).expect(201);
      await open(e3, plans[1]).expect(201);
      await request(h.server())
        .post('/api/v1/access-requests/drafts')
        .set(h.as(e3.account))
        .send({ kind: 'INDIVIDUAL', planId: plans[2], businessReason: 'Later' });

      const fourth = await open(e3, plans[2]).expect(409);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
      expect(detailsOf(fourth).openRequestIds).toHaveLength(3);
    });

    it('RV-12 QĐ-108c: a request exempt from the limits (ROLE_ENDED, TRANSFER_OVERLAP) is not counted', async () => {
      const e4 = await person('GH-E4');
      const sent: string[] = [];
      for (const planId of plans.slice(0, 3)) {
        sent.push(((await open(e4, planId).expect(201)).body as { data: { request: { id: string } } }).data.request.id);
      }
      await h.ctx.sql.query(`UPDATE access_requests SET limit_exemption = 'ROLE_ENDED' WHERE id = $1`, [sent[0]]);

      await open(e4, plans[3]).expect(201);
    });

    it('the database refuses an exemption it does not know', async () => {
      const e5 = await person('GH-E5');
      const sent = ((await open(e5, plans[4]).expect(201)).body as { data: { request: { id: string } } }).data.request;

      await expect(
        h.ctx.sql.query(`UPDATE access_requests SET limit_exemption = 'ANY' WHERE id = $1`, [sent.id]),
      ).rejects.toThrow(/access_requests_limit_exemption_known/);
    });

    it('US-01-04 AC-7: the Super Admin raises GH-2 to four and the fourth request is sent', async () => {
      const e6 = await person('GH-E6');
      for (const planId of plans.slice(0, 3)) await open(e6, planId).expect(201);
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 4).expect(200);
      try {
        await open(e6, plans[3]).expect(201);
      } finally {
        await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
      }
    });
  });

  describe('BR-MF1-01g GH-3: many paid applications in use', () => {
    let e7: Person;
    let fresh: string;

    beforeAll(async () => {
      e7 = await person('GH-E7');
      // Two paid seats the person holds today, on the subscriptions of two paid applications.
      for (const planId of [plans[0], plans[1]]) {
        await h.ctx.sql.query(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
             normalized_account_identifier, valid_from, valid_from_basis, owning_department_id, created_by_app_user_id)
           SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.work_email,
                  '2026-01-05', 'RECORDED', s.owner_department_id, gen_random_uuid()
             FROM subscriptions s JOIN employees e ON e.id = $2 WHERE s.plan_id = $1 LIMIT 1`,
          [planId, e7.employeeId],
        );
      }
      await h.setParameter('PAID_SOFTWARE_FLAG_THRESHOLD', 2).expect(200);
      fresh = await h.planOf(await h.subscription(20));
    });

    afterAll(async () => {
      await h.setParameter('PAID_SOFTWARE_FLAG_THRESHOLD', 10).expect(200);
    });

    it('the preview says a reason is required, with the count and the threshold', async () => {
      const preview = await h.previewed(e7, fresh);

      expect((preview as unknown as { limits: Record<string, unknown> }).limits).toMatchObject({
        paidSoftwareCount: 2,
        paidSoftwareThreshold: 2,
        reasonRequired: true,
        refusal: null,
      });
    });

    it('refuses the request without a reason, and flags it with one for the head and the spending approver', async () => {
      const without = await open(e7, fresh).expect(422);

      expect(codeOf(without)).toBe('ACCESS_REQUEST.MANY_PAID_SOFTWARE_REASON_REQUIRED');
      expect(detailsOf(without)).toEqual({ count: 2, threshold: 2 });

      const sent = (
        (await open(e7, fresh, { manyPaidSoftwareReason: 'The client works in it' }).expect(201)).body as {
          data: { request: { id: string; flags: unknown } };
        }
      ).data.request;
      expect(sent.flags).toEqual({ manyPaidSoftware: { count: 2, reason: 'The client works in it' } });

      const read = (await h.fetch(sent.id, head.account).expect(200)).body as { data: { request: { flags: unknown } } };
      expect(read.data.request.flags).toEqual({ manyPaidSoftware: { count: 2, reason: 'The client works in it' } });
    });

    it('does not flag nor store a reason under the threshold', async () => {
      const e8 = await person('GH-E8');
      const sent = (
        (await open(e8, fresh, { manyPaidSoftwareReason: 'Just in case' }).expect(201)).body as {
          data: { request: { id: string; flags: unknown } };
        }
      ).data.request;

      expect(sent.flags).toEqual({ manyPaidSoftware: null });
      const { rows } = await h.ctx.sql.query<{ many_paid_software: boolean; many_paid_software_reason: string | null }>(
        `SELECT many_paid_software, many_paid_software_reason FROM access_requests WHERE id = $1`,
        [sent.id],
      );
      expect(rows[0]).toEqual({ many_paid_software: false, many_paid_software_reason: null });
    });
  });

  describe('BR-MF1-01h QĐ-106g: a request for a group', () => {
    it('is refused whole with every line that breaks a limit, and nothing is written', async () => {
      const [ok, full, pending] = [await person('GH-G1'), await person('GH-G2'), await person('GH-G3')];
      for (const planId of plans.slice(0, 3)) await open(full, planId).expect(201);
      await open(pending, plans[4]).expect(201);
      const before = await h.requestRows();

      const refused = await request(h.server())
        .post('/api/v1/group-requests')
        .set(h.as(head.account))
        .send({
          planId: plans[4],
          businessReason: 'The team',
          lines: [{ employeeId: ok.employeeId }, { employeeId: full.employeeId }, { employeeId: pending.employeeId }],
        })
        .expect(422);

      expect(codeOf(refused)).toBe('GROUP_REQUEST.LINES_REFUSED');
      expect(JSON.stringify(refused.body)).toContain('OPEN_LIMIT_REACHED');
      expect(JSON.stringify(refused.body)).toContain('HAS_OPEN_REQUEST');
      expect(JSON.stringify(refused.body)).not.toContain(ok.employeeId);
      expect(await h.requestRows()).toBe(before);
    });
  });
});
