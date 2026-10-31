import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { LicensingRenewalApi } from '../../../src/modules/licensing/public/licensing-renewal.api';
import { ExpiryHarness } from '../../support/expiry-harness';
import type { Person } from '../../support/request-harness';

const h = new ExpiryHarness();

interface InboxRow {
  recipient_employee_id: string;
  params: Record<string, unknown>;
  event_key: string;
}

/**
 * `a03-license-inbox-alerts` E1 (`US-12-15` line 3, AC-8; `US-03-05` AC-1, AC-10): the reminder that a right ends within seven days
 * reaches the inbox of the holder, the head of their department today and the IT Admin in charge, through the hourly pass, on real
 * PostgreSQL: the boundary day, a pass run again, a department with no head, a role that changed hands, and a right renewed.
 */
describe('the inbox alert that a right is about to end (integration, real PostgreSQL)', () => {
  let target: { subscriptionId: string };
  let seq = 0;
  let it1: Person;
  const DAY = 24 * 3_600_000;

  beforeAll(async () => {
    await h.start();
    target = { subscriptionId: await h.subscription(80, 'K2') };
    it1 = { employeeId: h.it1.employeeId, account: h.it1 };
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department, a member whose right ends `endsIn` days from today, and its head and IT Admin in charge unless told otherwise. */
  const holder = async (endsIn: number, options: { head?: boolean; itAdmin?: Person | null } = {}) => {
    seq += 1;
    const department = await h.departmentWithUnit(`P-XI${seq}`);
    const member = await h.staff(department, `P-XI${seq}-E`);
    const head = await h.staff(department, `P-XI${seq}-H`);
    if (options.head !== false) await h.makeHead(department, head);
    const itAdmin = options.itAdmin === undefined ? it1 : options.itAdmin;
    if (itAdmin) await h.setItAdminInCharge(department, itAdmin);
    const assignmentId = await h.seatOf(member, target, { expectedEndDate: h.inDays(endsIn) });

    return { department, member, head, assignmentId };
  };

  const inbox = async (assignmentId: string): Promise<InboxRow[]> =>
    (
      await h.ctx.sql.query<InboxRow>(
        `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
          WHERE code = 'LICENSE_EXPIRY_REMINDER' AND subject_id = $1 ORDER BY recipient_employee_id`,
        [assignmentId],
      )
    ).rows;
  const told = async (assignmentId: string): Promise<string[]> =>
    (await inbox(assignmentId)).map((row) => row.recipient_employee_id).sort();

  it('tells the holder, the head and the IT Admin once each in the inbox, with no mail, and a pass run again tells nobody twice', async () => {
    const { member, head, assignmentId } = await holder(7);
    const mailBefore = await h.count('email_outbox');

    await h.noticeDue();

    expect(await told(assignmentId)).toEqual([member.employeeId, head.employeeId, it1.employeeId].sort());
    const rows = await inbox(assignmentId);
    expect(rows.every((row) => row.event_key === `LICENSE_EXPIRY_REMINDER:${assignmentId}:${h.inDays(7)}`)).toBe(true);
    const { rows: seat } = await h.ctx.sql.query<{ plan_id: string }>(
      `SELECT plan_id FROM license_assignments WHERE id = $1`,
      [assignmentId],
    );
    const planId = seat[0].plan_id;
    expect(rows.find((row) => row.recipient_employee_id === head.employeeId)?.params).toEqual({
      assignmentId,
      holderEmployeeId: member.employeeId,
      planId,
      expectedEndDate: h.inDays(7),
      audience: 'HEAD',
    });
    expect(JSON.stringify(rows)).not.toContain('@acme.vn');
    expect(await h.count('email_outbox')).toBe(mailBefore);

    // The holder reads it in their own inbox.
    const own = h.dataOf<{ items: { code: string; subject: { type: string; id: string } }[] }>(
      await request(h.server()).get('/api/v1/notifications?pageSize=50').set(h.as(member.account)).expect(200),
    ).items;
    expect(own.filter((notice) => notice.code === 'LICENSE_EXPIRY_REMINDER')).toEqual([
      expect.objectContaining({ subject: { type: 'LicenseAssignment', id: assignmentId }, readAt: null }),
    ]);

    // The same pass, and the pass of the next day, write nothing more.
    await h.noticeDue();
    await h.noticeDue(new Date(Date.now() + DAY));
    expect(await inbox(assignmentId)).toHaveLength(3);
  });

  it('tells on the seventh day and on a day that was missed, not on the eighth day before or after the end', async () => {
    const seventh = await holder(7);
    const eighth = await holder(8);
    const missed = await holder(2);
    const ended = await holder(-1);

    await h.noticeDue();

    expect(await inbox(seventh.assignmentId)).toHaveLength(3);
    expect(await inbox(eighth.assignmentId)).toHaveLength(0);
    expect(await inbox(missed.assignmentId)).toHaveLength(3);
    expect(await inbox(ended.assignmentId)).toHaveLength(0);
    // The eighth day becomes the seventh tomorrow.
    await h.noticeDue(new Date(Date.now() + DAY));
    expect(await inbox(eighth.assignmentId)).toHaveLength(3);
  });

  it('tells nobody in the place of a head a department lacks, and the head named later is told on the next pass (AC-10, QĐ-62c)', async () => {
    const { department, member, head, assignmentId } = await holder(5, { head: false });

    await h.noticeDue();

    // Exactly these two: no fallback approver, no Super Admin, nobody in the place of the head.
    expect(await told(assignmentId)).toEqual([member.employeeId, it1.employeeId].sort());
    await h.makeHead(department, head);
    await h.noticeDue();
    expect(await told(assignmentId)).toEqual([member.employeeId, head.employeeId, it1.employeeId].sort());
  });

  it('tells the person who holds the role at the pass: an IT Admin in charge who lost the role is not told, the one named after is', async () => {
    seq += 1;
    const exItAdmin = await h.staff(await h.departmentWithUnit(`P-XI${seq}`), `P-XI${seq}-X`);
    const { department, member, head, assignmentId } = await holder(4, { itAdmin: exItAdmin });

    await h.noticeDue();

    expect(await told(assignmentId)).toEqual([member.employeeId, head.employeeId].sort());
    expect((await h.reminderRows(assignmentId)).map((row) => row.audience)).toEqual(['EMPLOYEE', 'HEAD']);
    await h.setItAdminInCharge(department, it1);
    await h.noticeDue();
    expect(await told(assignmentId)).toEqual([member.employeeId, head.employeeId, it1.employeeId].sort());
    expect(await told(assignmentId)).not.toContain(exItAdmin.employeeId);
  });

  it('tells nothing of a right renewed before its reminder, and its new end is told only when it comes within seven days', async () => {
    const { assignmentId } = await holder(6);
    const actor: AuthenticatedPrincipal = {
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: randomUUID(),
      employeeId: h.it1.employeeId,
      directRoles: ['IT_ADMIN'],
      derivedRoles: [],
      roles: ['IT_ADMIN'],
    };
    const renewed = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingRenewalApi).renewAssignment(tx, actor, {
        assignmentId,
        requestId: randomUUID(),
        previousExpectedEndDate: h.inDays(6),
        newExpectedEndDate: h.inDays(40),
        now: new Date(),
      }),
    );

    await h.noticeDue();

    expect(await inbox(assignmentId)).toEqual([]);
    expect(await inbox(renewed.successorAssignmentId)).toEqual([]);
    await h.noticeDue(new Date(Date.now() + 33 * DAY));
    expect(await inbox(renewed.successorAssignmentId)).toHaveLength(3);
    expect(await inbox(assignmentId)).toEqual([]);
  });
});
