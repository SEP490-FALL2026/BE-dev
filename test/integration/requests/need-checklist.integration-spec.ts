import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { GroupHarness, type LineWire } from '../../support/group-harness';
import type { AccessRequestWire, Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

/**
 * The checklist of the need step (`PL-2.2`, `QĐ-111ap`, `QĐ-111aq`, R-6, R-24, `US-05-04` AC-20, AC-22) over real PostgreSQL: the answers kept with
 * the decision and the version of the policy, a No that locks the approval, the reason filled in from it, a request sent back to its sender who
 * sends it on again, a group sent back as a whole, and the version of the policy that changed between the checklist shown and the decision.
 */
describe('the checklist of the need step (integration, real PostgreSQL)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-C${counter}`);
  };
  const checklistsOf = (subjectId: string) =>
    h.ctx.sql
      .query<{
        decision: string;
        has_no: boolean;
        line_employee_id: string | null;
        policy_version_id: string;
        answers: { itemCode: string; answer: string }[];
      }>(
        `SELECT decision, has_no, line_employee_id, policy_version_id, answers FROM decision_checklists
          WHERE subject_id = $1 ORDER BY line_employee_id NULLS FIRST, decided_at`,
        [subjectId],
      )
      .then((result) => result.rows);
  const recordsOf = (requestId: string) =>
    h.ctx.sql
      .query<{ decision: string; reason: string | null }>(
        `SELECT decision, reason FROM approval_records WHERE request_id = $1 ORDER BY decided_at`,
        [requestId],
      )
      .then((result) => result.rows);
  const resubmit = (id: string, account: Person['account'], body?: object) => {
    const req = request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(account));
    return body === undefined ? req : req.send(body);
  };
  /** The question the head answers No: the second of the person. */
  const questionNo = 1;

  /** A request of one person for paid software, sent by a member of a department with a head. */
  const sentByMember = async () => {
    const u = await unit();
    const sent = await h.sent(u.member, paid);

    return { u, sent };
  };

  describe('one person asks (AC-20)', () => {
    it('keeps the answers with the version of the policy when the head approves with every question Yes', async () => {
      const { u, sent } = await sentByMember();

      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);

      const [row] = await checklistsOf(sent.id);
      expect(row).toMatchObject({ decision: 'APPROVE', has_no: false, line_employee_id: null });
      expect(row.policy_version_id).toBe(h.checklists.yes('1.2').policyVersionId);
      expect(row.answers.map((answer) => answer.itemCode)).toEqual(
        expect.arrayContaining(h.checklists.questionsOf('1.2')),
      );
      expect(row.answers.every((answer) => answer.answer === 'YES')).toBe(true);
    });

    it('locks the approval when an answer is No, names the question and saves nothing', async () => {
      const { u, sent } = await sentByMember();
      const no = h.checklists.questionsOf('1.2')[questionNo];

      const body = await h
        .decide(sent.id, { decision: 'APPROVE', checklist: h.checklists.answer('1.2', [no]) }, u.head.account)
        .expect(422);

      expect(bodyOf(body).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      expect((bodyOf(body).error.details as { items?: unknown }).items).toEqual([
        expect.objectContaining({ code: no }),
      ]);
      expect(await checklistsOf(sent.id)).toEqual([]);
      expect(await recordsOf(sent.id)).toEqual([]);
    });

    it('refuses with the reason filled in from the question answered No, and keeps the answers', async () => {
      const { u, sent } = await sentByMember();
      const no = h.checklists.questionsOf('1.2')[questionNo];

      const after = h.dataOf<{ request: AccessRequestWire }>(
        await h
          .decide(sent.id, { decision: 'REJECT', checklist: h.checklists.answer('1.2', [no]) }, u.head.account)
          .expect(200),
      ).request;

      expect(after.state).toBe('REJECTED');
      const [record] = await recordsOf(sent.id);
      expect(record.decision).toBe('REJECTED');
      expect(record.reason).toContain(no);
      expect(await checklistsOf(sent.id)).toEqual([expect.objectContaining({ decision: 'REJECT', has_no: true })]);
    });

    it('asks for a reason when a refusal has none and every answer is Yes', async () => {
      const { u, sent } = await sentByMember();

      const body = await h.decide(sent.id, { decision: 'REJECT' }, u.head.account).expect(422);

      expect(bodyOf(body).error.code).toBe('VALIDATION_ERROR');
      expect(await recordsOf(sent.id)).toEqual([]);
    });

    it('says which questions have no answer, and which answer names no question', async () => {
      const { u, sent } = await sentByMember();
      const [first, ...others] = h.checklists.questionsOf('1.2');
      const checklist = h.checklists.yes('1.2');

      const missing = await h
        .decide(
          sent.id,
          {
            decision: 'APPROVE',
            checklist: { ...checklist, answers: checklist.answers.filter((a) => a.itemCode === first) },
          },
          u.head.account,
        )
        .expect(422);
      const unknown = await h
        .decide(
          sent.id,
          {
            decision: 'APPROVE',
            checklist: { ...checklist, answers: [...checklist.answers, { itemCode: '9.9-99', answer: 'YES' }] },
          },
          u.head.account,
        )
        .expect(422);

      expect(bodyOf(missing).error).toMatchObject({
        code: 'POLICY.CHECKLIST_INCOMPLETE',
        details: { missing: others },
      });
      expect(bodyOf(unknown).error).toMatchObject({
        code: 'POLICY.CHECKLIST_INCOMPLETE',
        details: { unexpected: ['9.9-99'] },
      });
    });

    it('sends the request back to its sender with the reason, who sends it on again to the head, who then decides at a new step', async () => {
      const { u, sent } = await sentByMember();
      const no = h.checklists.questionsOf('1.2')[questionNo];

      const returned = h.dataOf<{ request: AccessRequestWire }>(
        await h
          .decide(sent.id, { decision: 'RETURN', checklist: h.checklists.answer('1.2', [no]) }, u.head.account)
          .expect(200),
      ).request;

      expect(returned.state).toBe('AWAITING_REQUESTER_REVISION');
      expect(returned.needDecision).toMatchObject({
        decision: 'RETURNED',
        reason: expect.stringContaining(no) as unknown,
      });
      expect(await recordsOf(sent.id)).toEqual([expect.objectContaining({ decision: 'RETURNED' })]);
      expect(await checklistsOf(sent.id)).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
      // Nobody but the sender sends it on, and the head cannot decide while it waits for the sender.
      await resubmit(sent.id, u.head.account).expect(403);
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(409);

      const again = h.dataOf<{ request: AccessRequestWire }>(
        await resubmit(sent.id, u.member.account, { replyNote: 'Added business justification' }).expect(200),
      ).request;

      expect(again.state).toBe('PENDING');
      expect(again.needStep).toMatchObject({ state: 'PENDING', assignee: { employeeId: u.head.employeeId } });
      expect(again.needStep.id).not.toBe(sent.needStep.id);
      const approved = h.dataOf<{ request: AccessRequestWire }>(
        await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200),
      ).request;
      expect(approved.state).toBe('AWAITING_SPEND_SUBMISSION');
      expect((await recordsOf(sent.id)).map((record) => record.decision)).toEqual(['RETURNED', 'APPROVED']);
      expect((await checklistsOf(sent.id)).map((row) => row.decision)).toEqual(['RETURN', 'APPROVE']);
    });

    it('turns away a checklist of a version the policy has left behind', async () => {
      const { u, sent } = await sentByMember();
      const shown = h.checklists.yes('1.2');
      await request(h.server())
        .put('/api/v1/policies/POL-MF1/draft')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({})
        .expect(200);
      await request(h.server())
        .post('/api/v1/policies/POL-MF1/draft/publish')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({
          changeNote: 'Quyết định số 21',
          applicableRoles: ['MANAGER'],
          requiresReacknowledgement: false,
        })
        .expect(201);

      const body = await h.decide(sent.id, { decision: 'APPROVE', checklist: shown }, u.head.account).expect(409);

      expect(bodyOf(body).error).toMatchObject({ code: 'POLICY.VERSION_CHANGED', details: { stepCode: '1.2' } });
      expect(await recordsOf(sent.id)).toEqual([]);
      // The head reads the questions again and decides on the new version.
      await h.checklists.load(h.ctx.sql, h.seed.organizationId);
      await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      const [row] = await checklistsOf(sent.id);
      expect(row.policy_version_id).not.toBe(shown.policyVersionId);
    });
  });

  describe('a group asks (AC-22, R-6)', () => {
    const sentByEmployee = async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const request = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, e3]), e1.account).expect(201),
      ).request;

      return { u, e1, e2, e3, request };
    };
    const lineOf = (employeeId: string, decision: 'APPROVE' | 'REJECT' | 'RETURN', reason?: string) => ({
      employeeId,
      decision,
      ...(reason ? { reason } : {}),
    });
    const lineList = async (id: string, account: Parameters<GroupHarness['linesOf']>[1]) =>
      h.dataOf<{ items: LineWire[] }>(await h.linesOf(id, account).expect(200)).items;

    it('keeps one set of answers for the whole group, once for each person', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();

      await h
        .decideLines(
          request.id,
          {
            lines: [
              lineOf(e1.employeeId, 'APPROVE'),
              lineOf(e2.employeeId, 'APPROVE'),
              lineOf(e3.employeeId, 'REJECT', 'Not needed'),
            ],
          },
          u.head.account,
        )
        .expect(200);

      const rows = await checklistsOf(request.id);
      expect(rows).toHaveLength(3);
      expect(rows.map((row) => [row.line_employee_id, row.decision]).sort()).toEqual(
        [
          [e1.employeeId, 'APPROVE'],
          [e2.employeeId, 'APPROVE'],
          [e3.employeeId, 'REJECT'],
        ].sort(),
      );
      expect(new Set(rows.map((row) => JSON.stringify(row.answers))).size).toBe(1);
    });

    it('locks the approval of everybody when an answer is No', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();
      const no = h.checklists.questionsOf('1.2')[questionNo];

      const body = await h
        .decideLines(
          request.id,
          {
            lines: [lineOf(e1.employeeId, 'APPROVE'), lineOf(e2.employeeId, 'REJECT'), lineOf(e3.employeeId, 'REJECT')],
            checklist: h.checklists.answer('1.2', [no]),
          },
          u.head.account,
        )
        .expect(422);

      expect(bodyOf(body).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
      expect(await checklistsOf(request.id)).toEqual([]);
    });

    it('refuses with the reason of each person filled in from the answer No when none is typed', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();
      const no = h.checklists.questionsOf('1.2')[questionNo];

      await h
        .decideLines(
          request.id,
          {
            lines: [
              lineOf(e1.employeeId, 'REJECT'),
              lineOf(e2.employeeId, 'REJECT', 'Mine'),
              lineOf(e3.employeeId, 'REJECT'),
            ],
            checklist: h.checklists.answer('1.2', [no]),
          },
          u.head.account,
        )
        .expect(200);

      const lines = await lineList(request.id, e1.account);
      expect(lines.map((line) => line.endReason)).toEqual([
        expect.stringContaining(no),
        'Mine',
        expect.stringContaining(no),
      ]);
    });

    it('sends the whole group back, keeps no decision of a person, and moves the people to a new step when the sender sends it on', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();
      const no = h.checklists.questionsOf('1.2')[questionNo];
      const before = await h.needSteps(request.id);

      const returned = h.dataOf<{ request: { id: string; state: string } }>(
        await h
          .decideLines(
            request.id,
            {
              lines: [
                lineOf(e1.employeeId, 'RETURN'),
                lineOf(e2.employeeId, 'RETURN'),
                lineOf(e3.employeeId, 'RETURN'),
              ],
              checklist: h.checklists.answer('1.2', [no]),
            },
            u.head.account,
          )
          .expect(200),
      ).request;

      expect(returned.state).toBe('AWAITING_REQUESTER_REVISION');
      // Only the sender is told, with the reason the checklist gave.
      await h.project();
      expect((await h.noticesOf(e1.employeeId, 'REQUEST_RETURNED')).map((notice) => notice.params)).toEqual([
        expect.objectContaining({ requestId: request.id, by: 'NEED', reason: expect.stringContaining(no) as unknown }),
      ]);
      expect(await h.noticesOf(e2.employeeId, 'REQUEST_RETURNED')).toEqual([]);
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
      expect((await h.needSteps(request.id)).map((step) => step.state)).toEqual(['CLOSED']);
      expect(await recordsOf(request.id)).toEqual([expect.objectContaining({ decision: 'RETURNED' })]);
      expect(
        (await h.ctx.sql.query('SELECT 1 FROM access_request_line_decisions WHERE request_id = $1', [request.id]))
          .rowCount,
      ).toBe(0);
      const rows = await checklistsOf(request.id);
      expect(rows.map((row) => [row.line_employee_id, row.decision, row.has_no]).sort()).toEqual(
        [e1, e2, e3].map((person) => [person.employeeId, 'RETURN', true]).sort(),
      );

      await resubmit(request.id, e1.account, { replyNote: 'Added team details' }).expect(200);

      const steps = await h.needSteps(request.id);
      expect(steps.map((step) => step.state)).toEqual(['CLOSED', 'PENDING']);
      expect(steps[1].id).not.toBe(before[0].id);
      const decided = await h
        .decideLines(
          request.id,
          {
            lines: [
              lineOf(e1.employeeId, 'APPROVE'),
              lineOf(e2.employeeId, 'APPROVE'),
              lineOf(e3.employeeId, 'APPROVE'),
            ],
          },
          u.head.account,
        )
        .expect(200);
      expect(h.dataOf<{ request: { state: string } }>(decided).request.state).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.lineStates(request.id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
    });

    it('lets the database move a line to another need step only from a returned step to a new one of the same request', async () => {
      const first = await sentByEmployee();
      const other = await sentByEmployee();
      const [otherStep] = await h.needSteps(other.request.id);

      await expect(
        h.ctx.sql.query('UPDATE access_request_lines SET need_step_id = $1 WHERE request_id = $2', [
          otherStep.id,
          first.request.id,
        ]),
      ).rejects.toThrow(/identity of a line never changes/);
    });

    it('refuses to send a group back in part', async () => {
      const { u, e1, e2, e3, request } = await sentByEmployee();

      const body = await h
        .decideLines(
          request.id,
          {
            lines: [
              lineOf(e1.employeeId, 'RETURN', 'Add the reason'),
              lineOf(e2.employeeId, 'APPROVE'),
              lineOf(e3.employeeId, 'APPROVE'),
            ],
          },
          u.head.account,
        )
        .expect(422);

      expect(bodyOf(body).error.code).toBe('VALIDATION_ERROR');
      expect(await h.lineStates(request.id)).toEqual(['AWAITING_NEED', 'AWAITING_NEED', 'AWAITING_NEED']);
    });
  });
});
