import request from 'supertest';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import { PgRelay } from '../../support/pg-relay';
import type { ApiAccount } from '../../support/api-accounts';
import { dataStatements, QueryCounter } from '../../support/query-count';
import type { Department, Person } from '../../support/request-harness';
import { recordAsSuperAdmin } from '../../support/super-admin-event-runner';

const h = new OffboardingHarness();
const M = 1_000_000;
const ROLE_FLAGGED = 'OFFBOARDING_CASE.ROLE_HOLDER_FLAGGED';

interface FlaggedEvent {
  after: {
    stage: string;
    priority: string;
    flags: string[];
    itAdminDepartmentCodes: string[];
    departmentHeadSuccessor: string | null;
    workspacesLoseOwner: boolean;
    workspaces: { planId: string; planName: string; applicationName: string; role: string }[];
  };
  actor_kind: string;
}
interface NoticeWire {
  lastWorkingDay: string;
  state: string;
  level: string;
  roleFlags: Record<string, boolean>;
}
interface WatchWire {
  status: string;
  reasons: Record<string, boolean>;
  warnings: Record<string, boolean>;
  holder: { id: string; workState: string; lastWorkingDay: string | null } | null;
}
type FlaggedCase = CaseWire & {
  roleFlags: Record<string, boolean>;
  warnings: CaseWire['warnings'] & { workspaces: Record<string, string> };
};

/**
 * US-03-04 AC-11, AC-12, AC-13, AC-27, AC-28: the roles of a person who leaves are warned about and never hold the record, the lock or
 * the revocations back; the person sees their own departure; the state of the Super Admin role is told in four ways; and a workspace
 * whose owner left keeps the case open until its profile names someone else. Over HTTP, on real PostgreSQL.
 */
describe('the roles of a person who leaves and the duties of a workspace (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let n = 0;
  const code = (prefix = 'E') => `${prefix}-RD-${(n += 1)}`;
  const superAdmin = (): ApiAccount => ({
    appUserId: h.seed.superAdmin.appUserId,
    employeeId: h.seed.superAdmin.employeeId,
    email: h.seed.superAdmin.email,
    accessToken: h.admin,
  });

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const flaggedEvents = async (caseId: string): Promise<FlaggedEvent[]> =>
    (
      await h.ctx.sql.query<FlaggedEvent>(
        `SELECT after, actor_kind::text AS actor_kind FROM audit_events WHERE resource_id = $1 AND action = $2 ORDER BY occurred_at, id`,
        [caseId, ROLE_FLAGGED],
      )
    ).rows;
  const flagsOf = (wire: FlaggedCase): string[] =>
    Object.entries(wire.roleFlags)
      .filter(([, held]) => held)
      .map(([flag]) => flag);
  const stored = async (caseId: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ role_flags: string[] }>(
        `SELECT role_flags::text[] AS role_flags FROM offboarding_cases WHERE id = $1`,
        [caseId],
      )
    ).rows[0].role_flags;
  const notice = (account: ApiAccount) => request(h.server()).get('/api/v1/me/departure-notice').set(h.as(account));
  const watch = (account: ApiAccount = h.it1) =>
    request(h.server()).get('/api/v1/super-admin-watch').set(h.as(account));
  const watched = async (account?: ApiAccount) => h.dataOf<WatchWire>(await watch(account).expect(200));
  const hired = async (person: Person) =>
    h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);

  describe('the roles that need someone to take over (AC-11)', () => {
    let department: Department;

    beforeAll(async () => {
      department = await h.departmentWithUnit('P-RDR');
    });

    it('flags the IT Admin in charge of a department and the head of a department, with the department and who follows', async () => {
      const inCharge = await h.worker(department, code(), ['IT_ADMIN']);
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $1 WHERE id = $2`, [
        inCharge.employeeId,
        department.id,
      ]);
      const wire = await h.recordedCase(inCharge);
      const headed = await h.departmentWithUnit('P-RDH');
      const head = await h.worker(headed, code());
      await h.makeHead(headed, head);
      const headCase = await h.recordedCase(head, { successor: { kind: 'NONE' } });

      expect(flagsOf(wire as FlaggedCase)).toEqual(['IT_ADMIN_IN_CHARGE']);
      expect(flagsOf(headCase as FlaggedCase)).toEqual(['DEPARTMENT_HEAD']);
      const events = await flaggedEvents(wire.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        after: { stage: 'RECORDED', priority: 'NORMAL', itAdminDepartmentCodes: ['P-RDR'] },
      });
      expect((await flaggedEvents(headCase.id))[0].after.departmentHeadSuccessor).toBe('NONE');
      expect(await stored(wire.id)).toEqual(['IT_ADMIN_IN_CHARGE']);
      expect(await stored(headCase.id)).toEqual(['DEPARTMENT_HEAD']);
      // The roles are read again when the case is read, and the person who left the role no longer holds it.
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [department.id]);
      expect(flagsOf(h.dataOf<FlaggedCase>(await h.readCase(wire.id).expect(200)))).toEqual([]);
      expect(
        h.dataOf<{ items: FlaggedCase[] }>(await h.listCases(`?roleFlag=IT_ADMIN_IN_CHARGE&pageSize=100`).expect(200))
          .items,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ id: wire.id })]));
    });

    it('flags the fallback approver, and says nothing of a person who holds no role', async () => {
      const fallback = await h.worker(department, code());
      await h.setRole('FALLBACK_APPROVER', fallback);
      const plain = await h.worker(department, code());

      const flagged = await h.recordedCase(fallback);
      const none = await h.recordedCase(plain);

      expect(flagsOf(flagged as FlaggedCase)).toEqual(['FALLBACK_APPROVER']);
      expect(flagsOf(none as FlaggedCase)).toEqual([]);
      expect(await flaggedEvents(none.id)).toHaveLength(0);
      expect(await stored(none.id)).toEqual([]);
      const warned = h.dataOf<FlaggedCase>(await h.readCase(flagged.id).expect(200));
      expect(warned.warnings?.registered).toMatchObject({ ROLE_HOLDER_NEEDS_REPLACEMENT: 1 });
      expect(h.dataOf<FlaggedCase>(await h.readCase(none.id).expect(200)).warnings?.registered).not.toHaveProperty(
        'ROLE_HOLDER_NEEDS_REPLACEMENT',
      );
    });

    it('moves the snapshot with the last working day and tells again only when the roles changed', async () => {
      const person = await h.worker(department, code());
      const wire = await h.recordedCase(person);
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(12), reason: 'Bàn giao muộn hơn' }).expect(200);
      expect(await flaggedEvents(wire.id)).toHaveLength(0);

      await h.setRole('FALLBACK_APPROVER', person);
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(14), reason: 'Bàn giao muộn hơn nữa' }).expect(200);
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(15), reason: 'Lại muộn hơn' }).expect(200);

      const events = await flaggedEvents(wire.id);
      expect(events.map((event) => [event.after.stage, event.after.flags])).toEqual([
        ['DUE_CHANGED', ['FALLBACK_APPROVER']],
      ]);
      expect(await stored(wire.id)).toEqual(['FALLBACK_APPROVER']);
      await h.setRole('FALLBACK_APPROVER', await h.worker(department, code()));
    });
  });

  describe('what the person sees of their own departure (AC-12)', () => {
    it('shows a person who does not leave nothing, and never the departure of someone else', async () => {
      expect(h.dataOf<NoticeWire | null>(await notice(h.finance).expect(200))).toBeNull();
      await request(h.server()).get('/api/v1/me/departure-notice').expect(401);
      const department = await h.departmentWithUnit('P-RDN');
      const person = await h.worker(department, code());
      await h.recordedCase(person);

      expect(h.dataOf<NoticeWire>(await notice(person.account).expect(200))).toMatchObject({
        state: 'HANDING_OVER',
        level: 'LEAVING',
      });
      expect(h.dataOf<NoticeWire | null>(await notice(h.employee).expect(200))).toBeNull();
    });
  });

  describe('the four states of the Super Admin role (AC-13)', () => {
    const holderId = () => h.seed.superAdmin.appUserId;
    const sql = (text: string, values: unknown[] = []) => h.ctx.sql.query(text, values);

    it('tells them apart and never counts a holder who hands over as unable to act because of the day', async () => {
      const healthy = await watched();
      expect(healthy).toMatchObject({
        status: 'HEALTHY',
        reasons: { LOCKED: false, LEFT: false, NOT_ACTIVATED: false, AWAITING_CREDENTIAL_RESET: false },
        warnings: { HOLDER_LEAVING: false, HANDOVER_OVERDUE: false },
        holder: { id: h.seed.superAdmin.employeeId, workState: 'WORKING' },
      });
      expect(await watched(superAdmin())).toMatchObject({ status: 'HEALTHY' });

      await sql(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [holderId()]);
      expect(await watched()).toMatchObject({ status: 'HOLDER_UNUSABLE', reasons: { LOCKED: true, LEFT: false } });
      await sql(`UPDATE app_users SET status = 'ACTIVE' WHERE id = $1`, [holderId()]);

      await sql(`UPDATE app_users SET activation_state = 'INVITED' WHERE id = $1`, [holderId()]);
      expect(await watched()).toMatchObject({ status: 'HOLDER_UNUSABLE', reasons: { NOT_ACTIVATED: true } });
      await sql(`UPDATE app_users SET activation_state = 'ACTIVATED' WHERE id = $1`, [holderId()]);

      const ticket = await sql(
        `INSERT INTO recovery_tickets (id, organization_id, ticket_ref, mode, status, target_app_user_id, approver_ref, operator_ref, environment)
         VALUES (gen_random_uuid(), $1, 'T-RD-1', 'RESET_CREDENTIALS', 'PENDING', $2, 'A', 'O', 'LOCAL_TEST') RETURNING id`,
        [h.seed.organizationId, holderId()],
      );
      expect(await watched()).toMatchObject({
        status: 'HOLDER_UNUSABLE',
        reasons: { AWAITING_CREDENTIAL_RESET: true, LOCKED: false },
      });
      await sql(`UPDATE recovery_tickets SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [
        (ticket.rows[0] as { id: string }).id,
      ]);
      expect(await watched()).toMatchObject({ status: 'HEALTHY' });

      await sql(`UPDATE employees SET work_state = 'HANDING_OVER' WHERE id = $1`, [h.seed.superAdmin.employeeId]);
      expect(await watched()).toMatchObject({
        status: 'HOLDER_LEAVING_STILL_USABLE',
        warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: false },
        reasons: { LOCKED: false, LEFT: false },
      });
      await sql(`UPDATE employees SET work_state = 'WORKING' WHERE id = $1`, [h.seed.superAdmin.employeeId]);

      await sql(`UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'SUPER_ADMIN'`, [
        holderId(),
      ]);
      expect(await watched()).toMatchObject({ status: 'NO_HOLDER', holder: null });
      await sql(`UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1 AND role = 'SUPER_ADMIN'`, [
        holderId(),
      ]);
      expect(await watched()).toMatchObject({ status: 'HEALTHY' });
    });

    it('lets only the Super Admin and the IT Admin read it', async () => {
      const head = (await h.departmentWithHead('P-RDW')).head;
      for (const account of [h.finance, head.account, h.employee]) await watch(account).expect(403);
      await request(h.server()).get('/api/v1/super-admin-watch').expect(401);
      await watch(superAdmin()).expect(200);
      await watch(h.it1).expect(200);
    });
  });

  describe('a workspace whose owner leaves (AC-28)', () => {
    const profile = (owner: Person, admin: Person) => ({
      primaryOwnerEmployeeId: owner.employeeId,
      members: [
        { employeeId: owner.employeeId, role: 'OWNER' },
        { employeeId: admin.employeeId, role: 'ADMIN' },
      ],
      ownerLimit: 1,
      ownerTransferProcedure: 'Transfer in the admin console, then confirm by mail',
      emergencyAccount: {
        identity: 'figma-breakglass',
        occupiesSeat: true,
        holderEmployeeId: admin.employeeId,
        lastReviewedOn: '2026-10-01',
      },
    });
    const putProfile = (planId: string, body: object) =>
      request(h.server()).put(`/api/v1/plans/${planId}/workspace-profile`).set(h.as(h.it1)).send(body);

    it('records the handover, warns with the workspace, tells again at the departure and keeps the case open until the owner changes', async () => {
      const department = await h.departmentWithUnit('P-RDWS');
      const a1 = await h.worker(department, code('A'), ['IT_ADMIN']);
      const a2 = await h.worker(department, code('A'), ['IT_ADMIN']);
      const planId = await h.planOf(await h.subscription(10, 'K2'));
      await putProfile(planId, profile(a1, a2)).expect(200);

      const wire = await h.recordedCase(a1);
      const detail = h.dataOf<FlaggedCase>(await h.readCase(wire.id).expect(200));
      expect(flagsOf(wire as FlaggedCase)).toEqual(['WORKSPACE_OWNER']);
      expect(Object.keys(detail.warnings.workspaces)).toEqual([planId]);
      expect(detail.warnings.registered).toMatchObject({ ROLE_HOLDER_NEEDS_REPLACEMENT: 1 });
      const second = await h.recordedCase(a2);
      expect(flagsOf(second as FlaggedCase)).toEqual(['WORKSPACE_OWNER']);

      await h.markLeft(wire.id, { accountLock: { note: 'Đã khóa tài khoản công ty' } }).expect(200);
      const events = await flaggedEvents(wire.id);
      expect(events.map((event) => [event.after.stage, event.after.priority, event.after.workspacesLoseOwner])).toEqual(
        [
          ['RECORDED', 'HIGH', false],
          ['LEFT', 'HIGH', true],
        ],
      );
      expect(events[1].after.workspaces).toEqual([
        expect.objectContaining({
          planId,
          role: 'PRIMARY_OWNER',
          applicationName: expect.stringContaining('') as string,
        }),
      ]);
      expect(JSON.stringify(events)).not.toMatch(/password|secret|token|credential|figma-breakglass/i);

      const refused = await h.closeCase(wire.id);
      expect([refused.status, h.codeOf(refused)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(h.detailsOf(refused).blockers).toEqual(['WORKSPACE_OWNER_NOT_TRANSFERRED']);
      const left = h.dataOf<FlaggedCase>(await h.readCase(wire.id).expect(200));
      expect(left.blockers).toEqual({ WORKSPACE_OWNER_NOT_TRANSFERRED: 1 });

      await putProfile(planId, {
        primaryOwnerEmployeeId: h.it1.employeeId,
        members: [{ employeeId: h.it1.employeeId, role: 'OWNER' }],
        ownerLimit: 1,
      }).expect(200);
      expect(h.dataOf<FlaggedCase>(await h.readCase(wire.id).expect(200)).blockers).toEqual({});
      await h.closeCase(wire.id).expect(200);
    });
  });

  describe('the list by role costs the same statements for any number of cases (LD-07)', () => {
    it('reads a constant number of statements for two cases and for twelve', async () => {
      const department = await h.departmentWithUnit('P-RDL');
      const fallback = await h.worker(department, code());
      await h.setRole('FALLBACK_APPROVER', fallback);
      await h.recordedCase(fallback);
      const small = await counter.run(() => h.listCases('?roleFlag=FALLBACK_APPROVER&pageSize=100').expect(200));
      for (let i = 0; i < 10; i += 1) await h.recordedCase(await h.worker(department, code()));
      const big = await counter.run(() => h.listCases('?pageSize=100').expect(200));
      const bigFiltered = await counter.run(() => h.listCases('?roleFlag=FALLBACK_APPROVER&pageSize=100').expect(200));

      expect(dataStatements(small.statements).length).toBeGreaterThan(0);
      expect(dataStatements(big.statements)).toHaveLength(dataStatements(small.statements).length);
      expect(dataStatements(bigFiltered.statements)).toHaveLength(dataStatements(small.statements).length);
      const rows = h.dataOf<{ items: FlaggedCase[] }>(big.result).items;
      expect(rows.length).toBeGreaterThanOrEqual(12);
      expect(rows.every((row) => Object.keys(row.roleFlags).length === 8)).toBe(true);
      const filtered = h.dataOf<{ items: FlaggedCase[] }>(bigFiltered.result).items;
      expect(filtered.map((row) => row.employee.id)).toContain(fallback.employeeId);
      // The filter reads the snapshot taken when the case was written: fewer cases, not the ones that held no role.
      expect(filtered.length).toBeLessThan(rows.length);
      await h.listCases('?roleFlag=NOT_A_ROLE').expect(422);
    });
  });

  describe('Finance and the spending approver leave without anyone to take over (AC-27)', () => {
    it('records both, locks both, closes both, and an approved request still reaches its grant', async () => {
      const unit = await h.departmentWithHead('P-RDF');
      await h.budgetFor(unit, { total: 200 * M, held: 20 * M, spent: 40 * M });
      const subscriptionId = await h.subscription(40);
      const planId = await h.planOf(subscriptionId);
      await h
        .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
      const sent = await h.sent(unit.member, planId, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 5 * M });
      await h.sendOn([sent.id], unit.head.account).expect(201);
      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
      await hired({ employeeId: h.finance.employeeId, account: h.finance });
      await hired(h.boss);

      const financeCase = await h.recordedCase({ employeeId: h.finance.employeeId, account: h.finance });
      const bossCase = await h.recordedCase(h.boss, { successor: { kind: 'NONE' } });

      expect(flagsOf(financeCase as FlaggedCase)).toEqual(['FINANCE']);
      expect(flagsOf(bossCase as FlaggedCase)).toEqual(['SPENDING_APPROVER']); // the approver heads no department (QĐ-93b)
      const substituted = await h.recordedCase(h.bystander);
      expect(flagsOf(substituted as FlaggedCase)).toEqual(['SUBSTITUTE_APPROVER']);
      for (const wire of [financeCase, bossCase]) {
        await h.markLeft(wire.id, { accountLock: { note: 'Đã khóa tài khoản công ty' } }).expect(200);
        const closed = h.dataOf<FlaggedCase>(await h.closeCase(wire.id).expect(200));
        expect(closed.closed).toBe(true);
        expect((await flaggedEvents(wire.id)).map((event) => event.after.stage)).toEqual(['RECORDED']);
      }
      // The commitment was written when the request was approved: nothing waits for the approver or for Finance to carry it out.
      const task = h.dataOf<{ task: { id: string } }>(
        await h.grant({ requestId: sent.id, subscriptionId }).expect(201),
      ).task;
      await h.claim(task.id).expect(200);
      expect(await h.state(sent.id)).toBe('EXECUTING');
    });
  });

  describe('the Super Admin who hands over and leaves (AC-11, AC-12)', () => {
    it('records the handover, warns the person with the last day, keeps the account working past it and tells the state', async () => {
      const person: Person = { employeeId: h.seed.superAdmin.employeeId, account: superAdmin() };
      await hired(person);
      const subjectCode = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          person.employeeId,
        ])
      ).rows[0].employee_code;
      // The application refuses to record an event about the Super Admin themself (QĐ-87c): the handover is recorded by the controlled
      // procedure, on a written ticket, and the Super Admin reads it through the application as anybody reads a case.
      const refusedRecord = await h.recordCase(h.body(person), person.account).expect(403);
      expect(h.codeOf(refusedRecord)).toBe('PERSONNEL.SELF_CHANGE_FORBIDDEN');
      const recorded = await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-RD-001', {
        mode: 'departure-record',
        lastWorkingDay: h.day(10),
      });
      const wire = h.dataOf<CaseWire>(await h.readCase(recorded.recordId).expect(200));

      expect(flagsOf(wire as FlaggedCase)).toEqual(['SUPER_ADMIN_HOLDER']);
      const events = await flaggedEvents(wire.id);
      expect(events.map((event) => [event.after.stage, event.after.priority, event.after.flags])).toEqual([
        ['RECORDED', 'HIGH', ['SUPER_ADMIN_HOLDER']],
      ]);
      expect(await stored(wire.id)).toEqual(['SUPER_ADMIN_HOLDER']);
      expect(await watched()).toMatchObject({
        status: 'HOLDER_LEAVING_STILL_USABLE',
        warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: false },
        holder: { workState: 'HANDING_OVER', lastWorkingDay: h.day(10) },
      });
      const mine = h.dataOf<NoticeWire>(await notice(superAdmin()).expect(200));
      expect(mine).toMatchObject({ lastWorkingDay: h.day(10), state: 'HANDING_OVER', level: 'LEAVING' });
      expect(mine.roleFlags.SUPER_ADMIN_HOLDER).toBe(true);
      const listed = h.dataOf<{ items: FlaggedCase[] }>(
        await h.listCases('?roleFlag=SUPER_ADMIN_HOLDER&state=HANDING_OVER').expect(200),
      ).items;
      expect(listed.map((row) => row.id)).toEqual([wire.id]);

      // Past the last working day the handover is not recorded as a departure: the account still works and the level changes.
      await h.ctx.sql.query(
        `UPDATE offboarding_cases SET last_working_day = $2::date, departure_effective_on = $3::date WHERE id = $1`,
        [wire.id, h.day(-2), h.day(-1)],
      );
      expect(h.dataOf<NoticeWire>(await notice(superAdmin()).expect(200))).toMatchObject({
        level: 'OVERDUE_HANDOVER',
        lastWorkingDay: h.day(-2),
      });
      expect(await watched()).toMatchObject({
        status: 'HOLDER_LEAVING_STILL_USABLE',
        warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: true },
      });
      await request(h.server()).get('/api/v1/me').set(h.as(superAdmin())).expect(200);

      // Even while the Super Admin hands over, nobody is given the role in the application (US-01-01 AC-15).
      const refusedGrant = await request(h.server())
        .post(`/api/v1/app-users/${h.employee.appUserId}/role-grants`)
        .set(h.as(superAdmin()))
        .send({ role: 'SUPER_ADMIN' })
        .expect(422);
      expect(h.codeOf(refusedGrant)).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');

      // The Super Admin does not mark themself as left in the application either; the procedure ends the handover and records the
      // departure that is already over, as the last write about the person.
      const refusedLeft = await h.markLeft(wire.id, {}, person.account).expect(403);
      expect(h.codeOf(refusedLeft)).toBe('PERSONNEL.SELF_CHANGE_FORBIDDEN');
      await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-RD-002', {
        mode: 'departure-cancel',
        caseId: wire.id,
        reason: 'The departure is recorded as already over',
      });
      const abrupt = await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-RD-003', {
        mode: 'abrupt-departure-record',
        lastWorkingDay: h.day(-2),
      });

      expect(await watched()).toMatchObject({
        status: 'HOLDER_UNUSABLE',
        reasons: { LEFT: true },
        warnings: { HOLDER_LEAVING: false, HANDOVER_OVERDUE: false },
      });
      expect((await flaggedEvents(abrupt.recordId)).map((event) => event.after.stage)).toEqual(['RECORDED', 'LEFT']);
      await request(h.server()).get('/api/v1/me').set(h.as(superAdmin())).expect(401);
      // Nobody can take the role in the application (US-01-01 AC-15): it comes back only through the recovery outside it.
      const grant = await request(h.server())
        .post('/api/v1/app-users')
        .set(h.as(h.it1))
        .send({ employeeId: h.employee.employeeId, roles: ['SUPER_ADMIN'] });
      expect(grant.status).toBe(403);
      expect(await watched()).toMatchObject({ status: 'HOLDER_UNUSABLE' });
    });
  });
});
