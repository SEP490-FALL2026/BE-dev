import { StatusHarness, type NoticeRow } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

const h = new StatusHarness();
const M = 1_000_000;

interface TaskWire {
  id: string;
  status: string;
}

/** What a notice says, without the ids that differ from one run to the next. */
const said = (rows: NoticeRow[]) => rows.map((row) => row.code);

describe('the status of a request told to the people it concerns, over PostgreSQL (US-05-15)', () => {
  let plan: string;
  let figma: string;
  let subscriptionId: string;
  let counter = 0;
  let superAdminEmployeeId: string;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    plan = await h.planOf(subscriptionId);
    figma = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    superAdminEmployeeId = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department of a head and a member with a budget of 100 million, 20 held and 40 spent, and an IT Admin in charge. */
  const example = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-N${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });

    return u;
  };
  const granted = async (id: string): Promise<TaskWire> =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId: id, subscriptionId }).expect(201)).task;
  /** The request is approved by its head and by the approver, so that it waits to be carried out. */
  const approved = async (u: Unit, amount = 15 * M): Promise<string> => {
    const id = await h.waitingForApprover(u, plan, { amount });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };

  describe('from the sending to the grant (US-05-15 AC-1, AC-7; US-05-18 AC-3)', () => {
    it('tells the requester each step of a paid request and how to get in, never the approver, and writes no mail', async () => {
      const u = await example();
      const mails = await h.count('email_outbox');

      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.project();
      expect(said(await h.noticesOf(u.member.employeeId))).toEqual(['REQUEST_SUBMITTED']);
      expect((await h.noticesOf(u.member.employeeId))[0].params).toEqual({
        requestId: sent.id,
        stage: 'WAITING_NEED_DECISION',
      });
      expect(await h.codesFor(u.head.employeeId, sent.id)).toEqual(['STEP_ASSIGNED']);
      expect((await h.noticesOf(u.head.employeeId, 'STEP_ASSIGNED'))[0].params).toEqual({
        requestId: sent.id,
        stepKind: 'NEED',
        cause: 'SUBMITTED',
      });

      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 15 * M });
      await h.sendOn([sent.id], u.head.account).expect(201);
      await h.project();
      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual(['REQUEST_SUBMITTED', 'REQUEST_NEED_APPROVED']);
      expect((await h.noticesOf(u.member.employeeId, 'REQUEST_NEED_APPROVED'))[0].params).toEqual({
        requestId: sent.id,
        next: 'SPEND_SUBMISSION',
      });

      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      const task = await granted(sent.id);
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
      await h.project();

      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual([
        'REQUEST_SUBMITTED',
        'REQUEST_NEED_APPROVED',
        'REQUEST_SPEND_APPROVED',
        'REQUEST_GRANTED',
      ]);
      expect((await h.noticesOf(u.member.employeeId, 'REQUEST_GRANTED'))[0].params).toEqual({
        requestId: sent.id,
        accessGuide: 'LOGIN_WITH_WORK_ACCOUNT',
        homepageUrl: null,
      });
      // The head decided the need and sent it on; the approver decided the spend: neither is told of their own act, and the
      // approver is told nothing at all of a request they have only decided.
      expect(await h.codesFor(u.head.employeeId, sent.id)).toEqual(['STEP_ASSIGNED']);
      expect(await h.codesFor(h.boss.employeeId, sent.id)).toEqual([]);
      expect(await h.count('email_outbox')).toBe(mails);
    });

    it('makes nothing the second time it reads the same events', async () => {
      const u = await example();
      await h.sent(u.member, plan, { termMonths: 1 });
      await h.project();
      const first = await h.noticeCount();

      const again = await h.project();

      expect(await h.noticeCount()).toBe(first);
      expect(again).toMatchObject({ busy: false, eventsRead: 0, notified: 0 });
    });

    it('gives the same answer to web and mobile: the notices carry no trace of the client (AC-10)', async () => {
      const u = await example();
      await h.sent(u.member, plan, { termMonths: 1 });
      await h.project();

      const web = await h.inbox(u.member.account).set('X-Client', 'web').expect(200);
      const mobile = await h.inbox(u.member.account).set('X-Client', 'mobile').expect(200);

      expect(h.dataOf(mobile)).toEqual(h.dataOf(web));
      expect(h.dataOf<{ items: unknown[] }>(web).items.length).toBeGreaterThan(0);
    });
  });

  describe('a refusal (US-05-15 AC-2; US-05-06 AC-5)', () => {
    it('tells the requester that the head refused with the reason, and does not tell the head', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });

      await h.decide(sent.id, { decision: 'REJECT', reason: 'Not needed this quarter' }, u.head.account).expect(200);
      await h.project();

      const refused = (await h.noticesOf(u.member.employeeId, 'REQUEST_REJECTED'))[0];
      expect(refused.params).toEqual({
        requestId: sent.id,
        by: 'NEED',
        reason: 'Not needed this quarter',
        suggestedPlanId: null,
      });
      expect(await h.codesFor(u.head.employeeId, sent.id)).toEqual(['STEP_ASSIGNED']);
    });

    it('tells the requester that the spending approver refused with the reason and the tool the IT Admin recorded as doing the same work', async () => {
      const u = await example();
      const proposed = await h.proposed(u.member);
      await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.saveAssessment(proposed.id, h.assessmentBody({ equivalentPlanId: figma }), h.it1).expect(200);
      await h.completeAssessment(proposed.id, h.it1).expect(200);
      await h.setPayments(proposed.id, { amount: 5 * M });
      await h.sendOn([proposed.id], u.head.account).expect(201);

      await h
        .decideSpend(proposed.id, { decision: 'REJECT', reason: 'Figma already does it' }, h.boss.account)
        .expect(200);
      await h.project();

      const refused = (await h.noticesOf(u.member.employeeId, 'REQUEST_REJECTED'))[0];
      expect(refused.params).toEqual({
        requestId: proposed.id,
        by: 'SPEND',
        reason: 'Figma already does it',
        suggestedPlanId: figma,
      });
      expect(await h.codesFor(h.boss.employeeId, proposed.id)).toEqual([]);
    });

    it('has no suggestion when the IT Admin recorded no tool that does the same work', async () => {
      const u = await example();
      const proposed = await h.proposed(u.member);
      await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.saveAssessment(proposed.id, h.assessmentBody(), h.it1).expect(200);
      await h.completeAssessment(proposed.id, h.it1).expect(200);
      await h.setPayments(proposed.id, { amount: 5 * M });
      await h.sendOn([proposed.id], u.head.account).expect(201);

      await h.decideSpend(proposed.id, { decision: 'REJECT', reason: 'No budget for it' }, h.boss.account).expect(200);
      await h.project();

      expect((await h.noticesOf(u.member.employeeId, 'REQUEST_REJECTED'))[0].params).toMatchObject({
        by: 'SPEND',
        suggestedPlanId: null,
      });
    });
  });

  describe('the refusal of the IT Admin at the gate of the assessment (US-05-15 AC-4; US-05-18 AC-3, AC-10, AC-11)', () => {
    const proposedAndApproved = async (u: Unit): Promise<string> => {
      const proposed = await h.proposed(u.member);
      await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);

      return proposed.id;
    };

    it('tells the requester, the person it is for and the head the kind, the reason and the alternative, and never the spending approver', async () => {
      const u = await example();
      const colleague = await h.staff(u.department, `N-C${counter}`);
      const id = await proposedAndApproved(u);
      // The request is also for a colleague: they are told the way it ended and not how it went.
      await h.ctx.sql.query(
        `INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, 2)`,
        [id, colleague.employeeId],
      );

      await h
        .rejectAssessment(
          id,
          {
            kind: 'UNCONTROLLABLE',
            reason: 'No admin console',
            alternativePlanId: figma,
            alternativeNote: 'Use Figma',
          },
          h.it1,
        )
        .expect(200);
      await h.project();

      const expected = {
        requestId: id,
        kind: 'UNCONTROLLABLE',
        reason: 'No admin console',
        alternativePlanId: figma,
        alternativeNote: 'Use Figma',
        noAlternative: false,
      };
      for (const person of [u.member, colleague, u.head]) {
        const rows = (await h.noticesOf(person.employeeId, 'REQUEST_IT_REJECTED')).filter(
          (row) => row.subject_id === id,
        );
        expect(rows.map((row) => row.params)).toEqual([expected]);
      }
      expect(await h.codesFor(colleague.employeeId, id)).toEqual(['REQUEST_IT_REJECTED']);
      expect(await h.codesFor(h.boss.employeeId, id)).toEqual([]);
      expect(await h.codesFor(h.it1.employeeId, id)).toEqual([]);
    });

    it('says there is no alternative when the IT Admin gave only the reason (AC-10)', async () => {
      const u = await example();
      const id = await proposedAndApproved(u);

      await h.rejectAssessment(id, { kind: 'NOT_ELIGIBLE', reason: 'Duplicates a tool we own' }, h.it1).expect(200);
      await h.project();

      expect((await h.noticesOf(u.member.employeeId, 'REQUEST_IT_REJECTED'))[0].params).toEqual({
        requestId: id,
        kind: 'NOT_ELIGIBLE',
        reason: 'Duplicates a tool we own',
        alternativePlanId: null,
        alternativeNote: null,
        noAlternative: true,
      });
    });
  });

  describe('a grant that fails (US-05-15 AC-5)', () => {
    it('says nothing while the task is failing and waits for the IT Admin, and tells of the failure only once it is closed, without why', async () => {
      const u = await example();
      const id = await approved(u);
      const task = await granted(id);
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The invitation bounced: smtp 550' }).expect(200);
      await h.project();
      expect(await h.codesFor(u.member.employeeId, id)).not.toContain('REQUEST_FAILED');

      await h.closeFailed(task.id, { reason: 'The vendor closed our account' }).expect(200);
      await h.project();

      const failed = (await h.noticesOf(u.member.employeeId, 'REQUEST_FAILED'))[0];
      expect(failed.params).toEqual({ requestId: id, contact: 'IT_ADMIN' });
      expect(JSON.stringify(failed)).not.toMatch(/smtp|bounced|vendor closed|last_error|lastError/i);
    });
  });

  describe('a step that waits under control and is then given (US-05-15 AC-8)', () => {
    it('tells a request that was sent with nobody to hold its step that it waits, and the Super Admin once', async () => {
      await h.clearRole('SPENDING_APPROVER');
      try {
        counter += 1;
        const executive = await h.departmentWithUnit(`P-NW${counter}`);
        const head = await h.staff(executive, `NW-H${counter}`);
        await h.makeHead(executive, head);
        const sent = await h.sent(head, plan, { termMonths: 1 });
        expect(sent.state).toBe('WAITING_CONTROLLED');
        await h.sweep();
        await h.sweep();
        await h.project();

        expect((await h.noticesOf(head.employeeId, 'REQUEST_SUBMITTED'))[0].params).toEqual({
          requestId: sent.id,
          stage: 'WAITING_CONTROLLED',
        });
        const alerts = (await h.noticesOf(superAdminEmployeeId, 'CONTROLLED_WAIT_ALERT')).filter(
          (row) => row.subject_id === sent.id,
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0].params).toMatchObject({
          requestId: sent.id,
          stepKind: 'NEED',
          waitingReason: 'NO_SPENDING_APPROVER',
        });
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('tells the requester that a step they were waiting on waits for a head, the Super Admin alone of the alert and nobody else, and then that it is given', async () => {
      const u = await example();
      const successor = await h.staff(u.department, `NW-S${counter}`);
      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.vacateHead(u.department.id).expect(200);
      await h.project();

      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual([
        'REQUEST_SUBMITTED',
        'REQUEST_WAITING_CONTROLLED',
      ]);
      expect((await h.noticesOf(u.member.employeeId, 'REQUEST_WAITING_CONTROLLED'))[0].params).toEqual({
        requestId: sent.id,
        stepKind: 'NEED',
      });
      const alerts = (await h.noticesOf(superAdminEmployeeId, 'CONTROLLED_WAIT_ALERT')).filter(
        (row) => row.subject_id === sent.id,
      );
      expect(alerts.map((row) => row.params)).toEqual([
        {
          requestId: sent.id,
          stepKind: 'NEED',
          waitingReason: 'NO_DEPARTMENT_HEAD',
          configurationHint: 'ASSIGN_DEPARTMENT_HEAD',
        },
      ]);
      // Nobody is told in the place of the Super Admin: not the IT Admin in charge, who held the alert for a missing approver of last resort.
      const itAdminAlerts = (await h.noticesOf(h.it1.employeeId, 'CONTROLLED_WAIT_ALERT')).filter(
        (row) => row.subject_id === sent.id,
      );
      expect(itAdminAlerts).toEqual([]);

      await h.makeHead(u.department, successor);
      await h.project();

      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual([
        'REQUEST_SUBMITTED',
        'REQUEST_WAITING_CONTROLLED',
        'REQUEST_WAITING_ENDED',
      ]);
      expect((await h.noticesOf(successor.employeeId, 'STEP_ASSIGNED')).map((row) => row.params)).toEqual([
        { requestId: sent.id, stepKind: 'NEED', cause: 'WAIT_ENDED' },
      ]);
    });
  });

  describe('the withdrawal and what follows from it (US-05-08; rows 9 to 12)', () => {
    it('tells the holder of the step that was closed, not the requester who withdrew', async () => {
      const u = await example();
      const sent = await h.sent(u.member, plan, { termMonths: 1 });
      await h.project();

      await h.withdrawRequest(sent.id, {}, u.member.account).expect(200);
      await h.project();

      expect(await h.codesFor(u.head.employeeId, sent.id)).toEqual(['STEP_ASSIGNED', 'STEP_CLOSED_BY_WITHDRAWAL']);
      expect((await h.noticesOf(u.head.employeeId, 'STEP_CLOSED_BY_WITHDRAWAL'))[0].params).toEqual({
        requestId: sent.id,
        stepKind: 'NEED',
      });
      expect(await h.codesFor(u.member.employeeId, sent.id)).toEqual(['REQUEST_SUBMITTED']);
    });

    it('tells the approver who held the spend step that it was closed', async () => {
      const u = await example();
      const id = await h.waitingForApprover(u, plan, { amount: 5 * M });

      await h.withdrawRequest(id, {}, u.member.account).expect(200);
      await h.project();

      expect(await h.codesFor(h.boss.employeeId, id)).toEqual(['STEP_CLOSED_BY_WITHDRAWAL']);
      expect((await h.noticesOf(h.boss.employeeId, 'STEP_CLOSED_BY_WITHDRAWAL'))[0].params).toEqual({
        requestId: id,
        stepKind: 'SPEND_APPROVAL',
      });
    });

    it('tells the IT Admin and Finance once that what was held went back, and the IT Admin that the task of the grant was cancelled', async () => {
      const u = await example();
      const id = await approved(u);
      const task = await granted(id);

      await h.withdrawRequest(id, {}, u.member.account).expect(200);
      await h.project();

      const released = (code: string, employeeId: string) =>
        h.noticesOf(employeeId, code).then((rows) => rows.filter((row) => row.subject_id === id));
      expect(await released('COMMITMENT_RELEASED_BY_WITHDRAWAL', h.finance.employeeId)).toHaveLength(1);
      expect(await released('COMMITMENT_RELEASED_BY_WITHDRAWAL', h.it1.employeeId)).toHaveLength(1);
      const cancelled = await released('GRANT_TASK_CANCELLED', h.it1.employeeId);
      expect(cancelled.map((row) => row.params)).toEqual([{ requestId: id, taskId: task.id }]);
      expect(await h.codesFor(u.member.employeeId, id)).not.toContain('REQUEST_WITHDRAWN');
      expect(JSON.stringify(await h.noticesAbout(id))).not.toMatch(/amount|minor|15000000/i);
    });

    it('gives the IT Admin the task to close when the grant had failed, and tells nobody the request ended before it did', async () => {
      const u = await example();
      const id = await approved(u);
      const task = await granted(id);
      await h.claim(task.id).expect(200);
      await h.fail(task.id, { reason: 'The invitation bounced' }).expect(200);

      await h.withdrawRequest(id, { reason: 'Not needed' }, u.member.account).expect(200);
      await h.project();

      expect((await h.noticesOf(h.it1.employeeId, 'WITHDRAWAL_AWAITING_IT_CLOSE')).map((row) => row.params)).toEqual([
        { requestId: id, taskId: task.id },
      ]);
      expect(await h.noticesOf(h.finance.employeeId, 'COMMITMENT_RELEASED_BY_WITHDRAWAL')).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ subject_id: id })]),
      );

      await h.cancelTask(task.id).expect(200);
      await h.project();
      expect(
        (await h.noticesOf(h.finance.employeeId, 'COMMITMENT_RELEASED_BY_WITHDRAWAL')).filter(
          (row) => row.subject_id === id,
        ),
      ).toHaveLength(1);
      expect(await h.codesFor(u.member.employeeId, id)).not.toContain('REQUEST_WITHDRAWN');
    });

    it('tells the requester, with the reason, that the head withdrew a request the data had stopped, and not the head', async () => {
      const u = await example();
      const id = await h.staleRequest(u);
      await h.sendOn([id], u.head.account).expect(201);

      await h.withdrawRequest(id, { reason: 'Moved to next year' }, u.head.account).expect(200);
      await h.project();

      const withdrawn = (await h.noticesOf(u.member.employeeId, 'REQUEST_WITHDRAWN'))[0];
      expect(withdrawn.params).toEqual({ requestId: id, byRequester: false, reason: 'Moved to next year' });
      expect(await h.codesFor(u.head.employeeId, id)).not.toContain('REQUEST_WITHDRAWN');
    });

    it('tells the people a head sent a request for how it ended, and nothing of how it went (AC-8 of the withdrawal)', async () => {
      const u = await example();
      counter += 1;
      const colleague = await h.staff(u.department, `N-D${counter}`);
      const other = await h.staff(u.department, `N-E${counter}`);
      const id = await h.sentForPeople(plan, [colleague, other], u.head.account, {
        businessReason: 'The new designers need the tool',
      });
      await h.project();
      expect(await h.codesFor(u.head.employeeId, id)).toEqual(['REQUEST_SUBMITTED']);
      expect((await h.noticesOf(u.head.employeeId, 'REQUEST_SUBMITTED'))[0].params).toMatchObject({
        stage: 'CONFIRMED',
      });
      expect(await h.codesFor(colleague.employeeId, id)).toEqual([]);
      expect(await h.codesFor(other.employeeId, id)).toEqual([]);

      await h.withdrawRequest(id, {}, u.head.account).expect(200);
      await h.project();

      expect(await h.codesFor(colleague.employeeId, id)).toEqual(['REQUEST_WITHDRAWN']);
      expect(await h.codesFor(other.employeeId, id)).toEqual(['REQUEST_WITHDRAWN']);
      expect(await h.codesFor(u.head.employeeId, id)).toEqual(['REQUEST_SUBMITTED']);
    });
  });
});
