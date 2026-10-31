import request from 'supertest';
import type { Pageable, ProposalWire, VersionWire } from '../../support/budget-harness';
import { NoticeHarness, type NoticeWire } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';

const h = new NoticeHarness();
const M = 1_000_000;

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.9a (F19, F21, F27, F29, F62, F65, reviews `P03-RV-03`, spec L.2 and L.10): the
 * database may hold, while this release runs or after H7 recovers to it, rows that the release after this one wrote: a request
 * being drafted, a cause, a source, a state or a trigger this release never writes, and an event whose actor is a procedure ticket
 * and not an account. This release must READ every one of them and answer 200 (or 404 for the draft), never fail on the enum or
 * on the NULL. Every row below is written by plain SQL over what the real routes made, as the next release will.
 */
describe('the vocabulary and the unnamed actors of the next release, read by the compatibility release (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let internalPlan: string;
  let paidPlan: string;
  let sequence = 0;
  const code = (prefix = 'E') => `${prefix}-VC-${(sequence += 1)}`;
  const sql = <T extends object = object>(text: string, values: unknown[] = []) => h.ctx.sql.query<T>(text, values);
  /**
   * Writes a row as the next release will. The immutability and append-only triggers of these tables are the rules of this
   * release's own writes (the next release replaces them with its own); a CHECK constraint is never bypassed.
   */
  const rewrite = async (table: string, assignments: string, where: string, values: unknown[]) => {
    await sql(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    try {
      return await sql(`UPDATE ${table} SET ${assignments} WHERE ${where}`, values);
    } finally {
      await sql(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    }
  };
  const get = (path: string, person: Person) => request(h.server()).get(`/api/v1${path}`).set(h.as(person.account));
  /**
   * The approval ticket of a procedure run (spec L.2): the "who" of an event that no account did. The final schema asks for exactly
   * one of the account and the ticket wherever the person is required, so an event the next release wrote by a ticket has the ticket
   * and no account.
   */
  const ticketFor = async (subjectEmployeeId: string, mode: string): Promise<string> =>
    (
      await sql<{ id: string }>(
        `INSERT INTO super_admin_event_tickets
           (id, organization_id, ticket_ref, mode, subject_employee_id, parameters_digest, approver_ref, operator_ref, environment)
         VALUES (gen_random_uuid(), $1, $2, $3::"SuperAdminEventMode", $4, 'digest-vc', 'approver-vc', 'operator-vc', 'LOCAL_TEST')
         RETURNING id`,
        [h.seed.organizationId, `VC-TICKET-${(sequence += 1)}`, mode, subjectEmployeeId],
      )
    ).rows[0].id;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    des = { ...(await h.department('R-DES', h.it1.employeeId)), unitId: '' };
    fin = { ...(await h.department('R-FIN')), unitId: '' };
    internalPlan = await h.plan('K5');
    paidPlan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(paidPlan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('a state, a trigger and a cause that only the next release writes', () => {
    it('reads a budget version that expired and a proposal the end of its fiscal year closed, in the detail, the lists and the filters (F62)', async () => {
      const unit = await h.departmentWithHead(`P-VC-${(sequence += 1)}`);
      const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);
      // The final schema asks for the moment each of the two states ended at (`expired_at`, `closed_at`).
      await sql(`UPDATE budget_versions SET state = 'EXPIRED', expired_at = now() WHERE id = $1`, [version.id]);
      await sql(`UPDATE budget_proposals SET state = 'CLOSED_FISCAL_YEAR_ENDED', closed_at = now() WHERE id = $1`, [
        proposal.id,
      ]);

      const closed = h.dataOf<{ proposal: ProposalWire }>(
        await h.proposalOf(proposal.id, unit.head.account).expect(200),
      );
      const expired = h.dataOf<{ version: VersionWire }>(await h.versionOf(version.id).expect(200));
      const proposals = h.dataOf<Pageable<ProposalWire>>(
        await h.proposalList(unit.head.account, { state: 'CLOSED_FISCAL_YEAR_ENDED' }).expect(200),
      );
      const versions = h.dataOf<Pageable<VersionWire>>(
        await h.versionList(h.finance, { state: 'EXPIRED' }).expect(200),
      );

      expect(closed.proposal.state).toBe('CLOSED_FISCAL_YEAR_ENDED');
      expect(expired.version.state).toBe('EXPIRED');
      expect(proposals.items.map((item) => item.id)).toContain(proposal.id);
      expect(versions.items.map((item) => item.id)).toContain(version.id);
      await h.versionLines(version.id).expect(200);
      await h.proposalLines(proposal.id, unit.head.account).expect(200);
    });

    it('reads the check of the budget that Finance’s outcome made again, with its trigger (F65)', async () => {
      const unit = await h.departmentWithHead(`P-VC-${(sequence += 1)}`);
      await h.budgetFor(unit, { total: 100 * M });
      const requestId = await h.paidRequest(unit, paidPlan, { year: h.year, dueOn: `${h.year}-12-15`, amount: 10 * M });
      const outcome = await h.route(requestId, unit.head.account);
      if (outcome.status !== 'ROUTED') throw new Error(`not checkable: ${outcome.reason}`);
      const updated = await rewrite(
        'request_budget_checks',
        `trigger = 'FINANCE_OUTCOME_WHILE_WAITING'`,
        'request_id = $1',
        [requestId],
      );
      expect(updated.rowCount).toBeGreaterThan(0);

      const check = h.dataOf<{ budgetCheck: { trigger: string } }>(await h.checkOf(requestId).expect(200)).budgetCheck;

      expect(check.trigger).toBe('FINANCE_OUTCOME_WHILE_WAITING');
    });

    it('reads the task and the list of a seat taken away by the review of a transfer, with its source (F21)', async () => {
      const employeeCode = code('R');
      await h.person(employeeCode);
      const filter = { planId: await h.plan('K5') };
      await h.written(filter, [
        {
          employee_code: employeeCode,
          account_identifier: `${employeeCode.toLowerCase()}@acme.vn`,
          granted_on: '2026-01-05',
        },
      ]);
      const [assignment] = await h.assignmentsOf(filter);
      const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
        h.ctx.app.get(LicensingApi).openRevocation(tx, h.principal(h.it1, ['IT_ADMIN']), {
          assignmentId: assignment.id,
          source: 'RETURN',
          decision: { decidedRole: 'MANAGER' },
        }),
      );
      await sql(`UPDATE provisioning_tasks SET revocation_source = 'POST_SETUP_REVIEW' WHERE id = $1`, [opened.taskId]);
      await rewrite('provisioning_task_reasons', `source = 'POST_SETUP_REVIEW'`, 'task_id = $1', [opened.taskId]);

      const task = h.dataOf<{ task: { revocation: { source: string } | null } }>(
        await h.getTask(opened.taskId).expect(200),
      ).task;
      const list = await request(h.server()).get('/api/v1/provisioning-tasks').set(h.as(h.it1)).expect(200);

      expect(task.revocation?.source).toBe('POST_SETUP_REVIEW');
      expect(JSON.stringify(h.dataOf(list))).toContain('POST_SETUP_REVIEW');
    });

    it('reads a request the IT Admin closed because its beneficiary was transferred (F29)', async () => {
      const unit = await h.departmentWithHead(`P-VC-${(sequence += 1)}`);
      const sent = await h.sent(unit.member, internalPlan);
      await sql(
        `UPDATE access_requests SET state = 'CANCELLED', cancelled_at = now(), cancelled_by_employee_id = $2,
                cancel_cause = 'BENEFICIARY_TRANSFERRED' WHERE id = $1`,
        [sent.id, h.it1.employeeId],
      );

      const read = h.dataOf<{ request: { state: string; cancellation: { cause: string } | null } }>(
        await h.fetch(sent.id, unit.member.account).expect(200),
      ).request;

      expect(read.state).toBe('CANCELLED');
      expect(read.cancellation).toMatchObject({ cause: 'BENEFICIARY_TRANSFERRED' });
    });

    it('shows a request being drafted only to its creator and as a draft: 404 to anybody else and for the timings, no part in a duplicate (F27, F92)', async () => {
      const unit = await h.departmentWithHead(`P-VC-${(sequence += 1)}`);
      const drafted = await h.sent(unit.member, internalPlan);
      // A draft has no moment it was sent (`access_requests_submitted_unless_draft`) and keeps what it is sent from in `policy.draft`.
      await sql(
        `UPDATE access_requests
            SET state = 'DRAFT', submitted_at = NULL,
                policy = jsonb_build_object('draft', jsonb_build_object(
                  'kind', 'INDIVIDUAL', 'planId', plan_id::text, 'businessReason', business_reason, 'termMonths', term_months))
          WHERE id = $1`,
        [drafted.id],
      );

      const own = h.dataOf<{ draft?: { id: string; kind: string }; request?: unknown }>(
        await h.fetch(drafted.id, unit.member.account).expect(200),
      );
      expect(own.request).toBeUndefined();
      expect(own.draft).toMatchObject({ id: drafted.id, kind: 'INDIVIDUAL' });
      await h.fetch(drafted.id, unit.head.account).expect(404);
      await get(`/access-requests/${drafted.id}/timings`, unit.member).expect(404);
      // It holds nobody's place: the same person may ask for the same software again, and that request is readable.
      const again = await h.sent(unit.member, internalPlan);
      await h.fetch(again.id, unit.member.account).expect(200);
    });
  });

  describe('an event whose actor is not an account (F19, spec L.2)', () => {
    it('reads a transfer and its change that no account recorded', async () => {
      const e1 = await h.veteran(des, code());
      const wire = await h.recorded({
        employeeId: e1.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });
      await h
        .rescheduleTransfer(wire.id, { newEffectiveOn: h.day(45), reason: 'Another day', grounds: h.grounds })
        .expect(200);
      const ticket = await ticketFor(e1.employeeId, 'TRANSFER_RECORD');
      await rewrite('department_transfers', 'recorded_by_app_user_id = NULL, recorded_by_ticket_id = $2', 'id = $1', [
        wire.id,
        ticket,
      ]);
      const changes = await rewrite(
        'department_transfer_changes',
        'changed_by_app_user_id = NULL, changed_by_ticket_id = $2',
        'transfer_id = $1',
        [wire.id, ticket],
      );
      expect(changes.rowCount).toBeGreaterThan(0);

      const read = h.dataOf<{ recordedByAppUserId: string | null }>(await h.readTransfer(wire.id).expect(200));
      const listed = h.dataOf<Pageable<{ changedByAppUserId: string | null }>>(
        await h.transferChanges(wire.id).expect(200),
      );
      await h.listTransfers().expect(200);

      expect(read.recordedByAppUserId).toBeNull();
      expect(listed.items.length).toBeGreaterThan(0);
      expect(listed.items.every((change) => change.changedByAppUserId === null)).toBe(true);
    });

    it('reads a departure, its changes and the verification of its notice that no account made', async () => {
      const head = await h.head(des, code('H'));
      const e1 = await h.worker(des, code());
      const sent = h.dataOf<NoticeWire>(
        await h.sendNotice({ employeeId: e1.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) }, head.account),
      );
      const recorded = h.dataOf<NoticeWire>(
        await h.recordNotice(sent.id, h.recording({ lastWorkingDay: h.day(6) })).expect(201),
      );
      const caseId = (recorded.recordedEvent as unknown as { id: string }).id;
      const ticket = await ticketFor(e1.employeeId, 'DEPARTURE_RECORD');
      await rewrite(
        'personnel_notice_verifications',
        'verified_by_app_user_id = NULL, verified_by_ticket_id = $2',
        'notice_id = $1',
        [sent.id, ticket],
      );
      await rewrite('offboarding_cases', 'recorded_by_app_user_id = NULL, recorded_by_ticket_id = $2', 'id = $1', [
        caseId,
        ticket,
      ]);
      const changes = await rewrite(
        'offboarding_case_changes',
        'changed_by_app_user_id = NULL, changed_by_ticket_id = $2',
        'case_id = $1',
        [caseId, ticket],
      );
      expect(changes.rowCount).toBeGreaterThan(0);

      // How a notice was checked is read by the Super Admin; the IT Admin reads a minimal view without it (F12).
      const notice = h.dataOf<NoticeWire>(await h.readNotice(sent.id, h.sa).expect(200));
      const read = h.dataOf<{ recordedByAppUserId: string | null }>(await h.readCase(caseId).expect(200));
      const listed = h.dataOf<Pageable<{ changedByAppUserId: string | null }>>(await h.caseChanges(caseId).expect(200));

      expect(notice.verification).toMatchObject({ verifiedByAppUserId: null });
      expect(read.recordedByAppUserId).toBeNull();
      expect(listed.items.every((change) => change.changedByAppUserId === null)).toBe(true);
    });

    it('reads a long leave and its changes that no account started', async () => {
      const e1 = await h.worker(des, code());
      const approval = {
        type: 'LEAVE_APPROVAL',
        reference: 'DN-05/2026',
        issuer: 'HR Department',
        issuedOn: '2026-05-25',
      };
      const started = h.dataOf<{ id: string }>(
        await h
          .startLongLeave({
            employeeId: e1.employeeId,
            startedOn: h.day(-1),
            approvedReturnOn: h.day(40),
            grounds: approval,
          })
          .expect(201),
      );
      const ticket = await ticketFor(e1.employeeId, 'LEAVE_START');
      await rewrite('employee_leaves', 'started_by_app_user_id = NULL, started_by_ticket_id = $2', 'id = $1', [
        started.id,
        ticket,
      ]);
      const changes = await rewrite(
        'employee_leave_changes',
        'recorded_by_app_user_id = NULL, recorded_by_ticket_id = $2',
        'leave_id = $1',
        [started.id, ticket],
      );
      expect(changes.rowCount).toBeGreaterThan(0);

      const read = h.dataOf<{ startedByAppUserId: string | null }>(
        await request(h.server()).get(`/api/v1/long-leaves/${started.id}`).set(h.as(h.it1)).expect(200),
      );
      const listed = h.dataOf<Pageable<{ recordedByAppUserId: string | null }>>(
        await request(h.server()).get(`/api/v1/long-leaves/${started.id}/changes`).set(h.as(h.sa)).expect(200),
      );

      expect(read.startedByAppUserId).toBeNull();
      expect(listed.items.every((change) => change.recordedByAppUserId === null)).toBe(true);
    });
  });
});
