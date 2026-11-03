import request from 'supertest';
import { ReturnHarness } from '../../support/return-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReturnHarness();
const M = 1_000_000;
const DRAFTS = '/api/v1/access-requests/drafts';
const MESSAGE =
  'The spending approver and an employee who is not placed in a department cannot ask for or be given access through a request.';

describe('the spending approver is no party of a Request, on every way to make one (D-S21, integration, real PostgreSQL)', () => {
  let paidPlan: string;
  let internalPlan: string;
  let servicePlan: string;
  let servicePlanSubscription: string;
  let renewalSeat: string;
  let returnedSeat: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paidPlan = await h.planOf(await h.subscription(100));
    internalPlan = await h.plan('K5');
    servicePlanSubscription = await h.subscription(10, 'K2');
    servicePlan = await h.planOf(servicePlanSubscription);
    await h
      .declareTaxProfile((await h.vendorOf(servicePlan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    // The spending approver holds two seats (a baseline records them, no request does) while the baseline is open; then it is closed,
    // which a request for a service account waits for.
    renewalSeat = await h.seatOf(
      h.boss,
      { subscriptionId: await h.subscription(10, 'K2') },
      { expectedEndDate: h.inDays(30) },
    );
    returnedSeat = await h.seatOf(h.boss, { subscriptionId: await h.subscription(10, 'K2') });
    await h.closeBaseline().expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-AP${counter}`);
  };
  /** The spending approver is somebody else for the length of a test, and the installation's approver again after. */
  const approverIs = async (person: Person, test: () => Promise<void>) => {
    await h.setRole('SPENDING_APPROVER', person);
    try {
      await test();
    } finally {
      await h.setRole('SPENDING_APPROVER', h.boss);
    }
  };
  /** What a refused Request leaves behind: nothing, whatever the way it was made. */
  const written = async () => [
    await h.count('access_requests'),
    await h.count('access_request_steps'),
    await h.count('budget_commitments'),
    await h.count('provisioning_tasks'),
    await h.count('license_assignments'),
  ];
  const refusal = (party: 'REQUESTER' | 'BENEFICIARY', employeeId: string) => ({
    reason: 'SPENDING_APPROVER',
    party,
    employeeIds: [employeeId],
  });
  const saveDraft = (body: object, person: Person) =>
    request(h.server()).post(DRAFTS).set(h.as(person.account)).send(body);
  const submitDraft = (id: string, person: Person) =>
    request(h.server()).post(`${DRAFTS}/${id}/submission`).set(h.as(person.account)).send({});

  it('refuses every request type sent by the spending approver with REQUEST_PARTY.INELIGIBLE', async () => {
    const before = await written();
    const sentAs = h.boss;
    const calls = [
      await h.submit(h.form(paidPlan), sentAs.account),
      await h.submit(h.form(internalPlan), sentAs.account),
      await h.propose(h.proposeBody(), sentAs.account),
      await h.submitService(h.serviceForm(servicePlan), sentAs.account),
    ];

    for (const refused of calls) {
      expect(refused.status).toBe(422);
      expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect((refused.body as { error: { message: string } }).error.message).toBe(MESSAGE);
      expect(h.detailsOf(refused)).toEqual(refusal('REQUESTER', h.boss.employeeId));
    }
    expect(await written()).toEqual(before);
  });

  it('lets everybody else send, and the person who is no longer the spending approver again', async () => {
    const u = await unit();
    const former = await h.staff(u.department, 'AP-FORMER');
    await approverIs(former, async () => {
      expect((await h.submit(h.form(internalPlan), former.account)).status).toBe(422);
    });

    expect((await h.submit(h.form(internalPlan), former.account)).status).toBe(201);
    expect((await h.submit(h.form(internalPlan), u.member.account)).status).toBe(201);
  });

  describe('the renewal of a seat (US-05-14 AC-6)', () => {
    it('refuses the spending approver who renews their own seat, and the head who renews the seat of the spending approver', async () => {
      const before = await written();
      const body = { assignmentId: renewalSeat, newExpectedEndDate: h.inDays(90), businessReason: 'Still needed' };

      const own = await h.renew(body, h.boss.account);
      const byHead = await h.renew(body, h.executiveHead.account);

      expect(own.status).toBe(422);
      expect(h.codeOf(own)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect(h.detailsOf(own)).toEqual(refusal('REQUESTER', h.boss.employeeId));
      expect(byHead.status).toBe(422);
      expect(h.codeOf(byHead)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect(h.detailsOf(byHead)).toEqual(refusal('BENEFICIARY', h.boss.employeeId));
      expect(await written()).toEqual(before);
    });
  });

  describe('a draft that could never be sent (OD-3)', () => {
    const individual = () => ({
      kind: 'INDIVIDUAL',
      planId: paidPlan,
      businessReason: 'Design the new brand',
      termMonths: 6,
    });

    it('is not saved for the spending approver, whatever its kind', async () => {
      const before = await written();
      const group = {
        kind: 'GROUP',
        planId: paidPlan,
        lines: [{ employeeId: h.boss.employeeId }],
        businessReason: 'The new brand needs the shared workspace',
        termMonths: 6,
      };
      const service = {
        kind: 'SERVICE_ACCOUNT',
        planId: servicePlan,
        purpose: 'Build bot of the CI pipeline',
        expectedIdentifier: 'ci-bot-9',
        businessReason: 'Run the builds',
        termMonths: 1,
      };

      for (const body of [individual(), group, service]) {
        const refused = await saveDraft(body, h.boss);

        expect(refused.status).toBe(422);
        expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
        expect(h.detailsOf(refused)).toEqual(refusal('REQUESTER', h.boss.employeeId));
      }
      expect(await written()).toEqual(before);
    });

    it('is not saved for a group with the spending approver as a line, and the other lines make no difference', async () => {
      const u = await unit();
      const before = await written();

      const refused = await saveDraft(
        {
          kind: 'GROUP',
          planId: paidPlan,
          lines: [{ employeeId: u.member.employeeId }, { employeeId: h.boss.employeeId }],
          businessReason: 'The new brand needs the shared workspace',
          termMonths: 6,
        },
        u.head,
      );

      expect(refused.status).toBe(422);
      expect(h.detailsOf(refused)).toEqual(refusal('BENEFICIARY', h.boss.employeeId));
      expect(await written()).toEqual(before);
    });

    it('stays a draft when its sender became the spending approver before sending it', async () => {
      const u = await unit();
      const saved = h.dataOf<{ draft: { id: string } }>(await saveDraft(individual(), u.member).expect(201)).draft.id;
      const before = await written();

      await approverIs(u.member, async () => {
        const refused = await submitDraft(saved, u.member);

        expect(refused.status).toBe(422);
        expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
      });

      expect(await written()).toEqual(before);
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM access_requests WHERE id = $1 AND state = 'DRAFT'`, [saved])).rowCount,
      ).toBe(1);
      expect((await submitDraft(saved, u.member)).status).toBe(201);
    });
  });

  describe('the seat that is given back (US-05-13 AC-11)', () => {
    it('refuses the spending approver who returns their seat, and the head who confirms it is no longer needed', async () => {
      const before = await written();
      const returns = await h.count('return_requests');
      const body = { assignmentId: returnedSeat, reason: 'The project is over' };

      const own = await h.returnSeat(body, h.boss.account);
      const byHead = await h.returnSeat(body, h.executiveHead.account);

      expect(own.status).toBe(422);
      expect(h.codeOf(own)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect(h.detailsOf(own)).toEqual(refusal('REQUESTER', h.boss.employeeId));
      expect(byHead.status).toBe(422);
      expect(h.detailsOf(byHead)).toEqual(refusal('BENEFICIARY', h.boss.employeeId));
      expect(await h.count('return_requests')).toBe(returns);
      expect(await written()).toEqual(before);
    });
  });

  describe('the person the IT Admin names as responsible for a service account (US-05-21 AC-8)', () => {
    it('is never the spending approver, and the department is not looked at first', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const id = await h.approvedService(u, u.member, servicePlan, 10 * M);
      await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);
      const before = await written();

      // The spending approver is of another department: outside the department would be the answer of a department check.
      const refused = await h
        .grant({
          requestId: id,
          subscriptionId: servicePlanSubscription,
          accountIdentifier: 'party-bot',
          responsibleEmployeeId: h.boss.employeeId,
        })
        .expect(422);

      expect(h.codeOf(refused)).toBe('REQUEST_PARTY.INELIGIBLE');
      expect(h.detailsOf(refused)).toEqual(refusal('BENEFICIARY', h.boss.employeeId));
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      expect(await written()).toEqual(before);
    });
  });

  describe('a request is no step for the spending approver (US-05-03 AC-15)', () => {
    it('never gives the spending approver a step of a request they are a party of, because no such request is made', async () => {
      const u = await unit();
      await h.submit(h.form(paidPlan), h.boss.account);
      await h.sendDelegated(
        {
          beneficiaryEmployeeIds: [h.boss.employeeId],
          items: [{ planId: paidPlan }],
          businessReason: 'The new designer needs the tools',
          termMonths: 6,
        },
        u.head.account,
      );

      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM access_requests r
              WHERE r.requester_employee_id = $1
                 OR EXISTS (SELECT 1 FROM access_request_beneficiaries b WHERE b.request_id = r.id AND b.employee_id = $1)`,
            [h.boss.employeeId],
          )
        ).rowCount,
      ).toBe(0);
    });
  });
});
