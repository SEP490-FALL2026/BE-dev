import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { NotificationsApi } from '../../../src/modules/notifications/public/notifications.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/** What a correction carried before `QĐ-93f`: it takes no HR basis any more, so a body that still carries one is refused. */
const HR_BASIS_BODY = {
  type: 'LABOR_CONTRACT',
  reference: 'HD-2026-001',
  issuer: 'HR Department',
  issuedOn: '2026-10-01',
};

interface MaintainedWire {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: string;
  hireDate: string;
  jobTitle: string | null;
  status: string;
}

/**
 * US-02-02 AC-19 (QĐ-82m INF-20, QĐ-87a): the Super Admin corrects the official fields of a record that exists, with no HR basis to give (QĐ-93f), and
 * never their own (QĐ-87c, F19); the IT Admin does not (F11).
 */
describe('correcting the official fields of an employee over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
    // it1 is the IT Admin in charge of the seed department: a role that may no longer correct a record.
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $1 WHERE id = $2`, [
      h.it1.employeeId,
      h.seed.departmentId,
    ]);
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const superAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const patch = (id: string, body: object, headers: Record<string, string> = superAdmin()) =>
    request(h.server()).patch(`/api/v1/employees/${id}`).set(headers).send(body);
  const dataOf = (response: request.Response) => (response.body as { data: MaintainedWire }).data;
  const codeOf = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const reasonsOf = (response: request.Response) =>
    (response.body as { error: { details: { reasons: { field: string; code: string }[] } } }).error.details.reasons;
  const rowOf = async (id: string) =>
    (
      await h.ctx.sql.query<{
        full_name: string;
        work_email: string | null;
        normalized_work_email: string | null;
        employment_type: string;
        hire_date: string;
        job_title: string | null;
        status: string;
      }>(
        `SELECT full_name, work_email, normalized_work_email, employment_type, to_char(hire_date, 'YYYY-MM-DD') AS hire_date,
                job_title, status
           FROM employees WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const auditOf = async (id: string) =>
    (
      await h.ctx.sql.query<{
        actor_app_user_id: string;
        actor_roles: string[];
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      }>(
        `SELECT actor_app_user_id, actor_roles, before, after FROM audit_events
          WHERE action = 'EMPLOYEE.OFFICIAL_FIELDS_CHANGED' AND resource_id = $1 ORDER BY occurred_at, id`,
        [id],
      )
    ).rows;

  it('lets the Super Admin change the name, and records who, the values before and after, and no HR basis (AC-19, QĐ-93f)', async () => {
    const id = await h.person('MNT1');

    const response = await patch(id, { fullName: 'Nguyễn Văn A' }).expect(200);

    expect((response.body as { message: string }).message).toBe('EMPLOYEE.UPDATED');
    expect(dataOf(response)).toMatchObject({ id, employeeCode: 'MNT1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' });
    expect((await rowOf(id)).full_name).toBe('Nguyễn Văn A');
    expect(await auditOf(id)).toEqual([
      {
        actor_app_user_id: h.seed.superAdmin.appUserId,
        actor_roles: ['SUPER_ADMIN'],
        before: { employeeCode: 'MNT1', fullName: 'Person MNT1' },
        after: { fullName: 'Nguyễn Văn A' },
      },
    ]);
  });

  describe('the job title: optional free text, corrected with no HR basis (QĐ-87e, F11, QĐ-93f)', () => {
    it('is set, changed and cleared as typed, with the display form stored and before and after in the audit', async () => {
      const id = await h.person('MNT-T1');

      const set = await patch(id, { jobTitle: '  Chief   Happiness  Officer ' }).expect(200);
      const changed = await patch(id, { jobTitle: 'Head of Joy' }).expect(200);
      const cleared = await patch(id, { jobTitle: null }).expect(200);

      expect(dataOf(set).jobTitle).toBe('Chief Happiness Officer');
      expect(dataOf(changed).jobTitle).toBe('Head of Joy');
      expect(dataOf(cleared).jobTitle).toBeNull();
      expect((await rowOf(id)).job_title).toBeNull();
      expect((await auditOf(id)).map((event) => [event.before.jobTitle, event.after.jobTitle])).toEqual([
        ['Administrator', 'Chief Happiness Officer'],
        ['Chief Happiness Officer', 'Head of Joy'],
        ['Head of Joy', null],
      ]);
    });

    it('refuses a title longer than 255 characters as a reason of the row, and changes nothing', async () => {
      const id = await h.person('MNT-T2');
      const before = await rowOf(id);

      const response = await patch(id, { jobTitle: 'x'.repeat(256) }).expect(422);

      expect(codeOf(response)).toBe('EMPLOYEE.ROW_INVALID');
      expect(reasonsOf(response)).toEqual([{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }]);
      expect(await rowOf(id)).toEqual(before);
    });

    it('is not an event: no placement is added and no transfer is recorded for it', async () => {
      const id = await h.person('MNT-T3');
      const count = async () =>
        (
          await h.ctx.sql.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM employee_placements WHERE employee_id = $1`,
            [id],
          )
        ).rows[0].n;
      const placements = await count();

      await patch(id, { jobTitle: 'Brand new title' }).expect(200);

      expect(await count()).toBe(placements);
      expect((await h.ctx.sql.query(`SELECT 1 FROM department_transfers WHERE employee_id = $1`, [id])).rows).toEqual(
        [],
      );
    });
  });

  describe('the in-app notices of a correction (QĐ-87b(3), F17)', () => {
    const noticesFor = async (employeeIds: string[]) =>
      (
        await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
          `SELECT recipient_employee_id, params FROM in_app_notifications
            WHERE code = 'EMPLOYEE_PROFILE_UPDATED' AND recipient_employee_id = ANY($1::uuid[])`,
          [employeeIds],
        )
      ).rows;

    it('tells the employee and the head of their department, in the same transaction, with ids only', async () => {
      const subject = await h.person('MNT-N1');
      const head = await h.person('MNT-N2');
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-05')`,
        [h.seed.organizationId, h.seed.departmentId, head],
      );

      await patch(subject, { fullName: 'Renamed Person' }).expect(200);

      const notices = await noticesFor([subject, head]);
      expect(notices.map((notice) => notice.recipient_employee_id).sort()).toEqual([head, subject].sort());
      for (const notice of notices) {
        expect(notice.params).toEqual({ employeeId: subject, departmentId: h.seed.departmentId });
      }
    });

    it('tells nobody when nothing changed, and nothing is left behind when the correction is refused', async () => {
      const subject = await h.person('MNT-N3');

      await patch(subject, { fullName: 'Person MNT-N3' }).expect(200);
      await patch(subject, { jobTitle: 'x'.repeat(256) }).expect(422);

      expect(await noticesFor([subject])).toEqual([]);
    });

    // F17: the notices are written in the transaction of the correction. The inbox refuses the SECOND notice, after the first was
    // written: the correction goes with it (the record as it was, no audit) and so does the first notice.
    it('rolls the correction back when a notice fails, and leaves no notice of a correction that was rolled back', async () => {
      const subject = await h.person('MNT-R1');
      const heads = await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT employee_id FROM department_head_periods WHERE department_id = $1 AND valid_to IS NULL`,
        [h.seed.departmentId],
      );
      if (heads.rows.length === 0) {
        await h.ctx.sql.query(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-05')`,
          [h.seed.organizationId, h.seed.departmentId, await h.person('MNT-R2')],
        );
      }
      const noticesAbout = async (employeeId: string) =>
        (
          await h.ctx.sql.query<{ recipient_employee_id: string }>(
            `SELECT recipient_employee_id FROM in_app_notifications
              WHERE code = 'EMPLOYEE_PROFILE_UPDATED' AND params ->> 'employeeId' = $1`,
            [employeeId],
          )
        ).rows;
      const before = await rowOf(subject);
      const inbox = h.ctx.app.get(NotificationsApi, { strict: false });
      const written = inbox.notifyInApp.bind(inbox);
      let calls = 0;
      const failing = jest.spyOn(inbox, 'notifyInApp').mockImplementation((tx, input) => {
        calls += 1;

        return calls === 2 ? Promise.reject(new Error('the inbox refused the second notice')) : written(tx, input);
      });
      let status: number;
      try {
        status = (await patch(subject, { fullName: 'Rolled Back Name' })).status;
      } finally {
        failing.mockRestore();
      }

      expect(status).toBe(500);
      expect(calls).toBe(2);
      expect(await rowOf(subject)).toEqual(before);
      expect(await auditOf(subject)).toEqual([]);
      expect(await noticesAbout(subject)).toEqual([]);
    });
  });

  it('changes nothing and writes no audit event when the values are the ones the record already has', async () => {
    const id = await h.person('MNT3');

    await patch(id, { fullName: 'Person MNT3', employmentType: 'STAFF' }).expect(200);

    expect(await auditOf(id)).toEqual([]);
  });

  describe('no HR basis is taken (QĐ-93f)', () => {
    it('refuses a body that still carries one, naming it, and writes nothing', async () => {
      const id = await h.person(`MNT-B${randomUUID().slice(0, 6)}`);
      const before = await rowOf(id);

      const response = await patch(id, { fullName: 'Changed', hrBasis: HR_BASIS_BODY }).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).toContain('unrecognized_keys');
      expect(await rowOf(id)).toEqual(before);
      expect(await auditOf(id)).toEqual([]);
    });
  });

  describe('who may do it, and what may not be changed', () => {
    it('is not an operation of the IT Admin, not even the one in charge of the department, nor of Finance or an employee (F11, F13)', async () => {
      const id = await h.person('MNT4');
      const before = await rowOf(id);

      for (const headers of [h.as(h.it1), h.as(h.finance), h.as(h.employee)]) {
        expect(codeOf(await patch(id, { fullName: 'Nope' }, headers).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      }

      expect(await rowOf(id)).toEqual(before);
    });

    it.each([
      ['a department', { departmentCode: 'P-OPS' }],
      ['a catalogue entry for the title', { jobTitleId: randomUUID() }],
      ['a status', { status: 'TERMINATED' }],
      ['the employee code', { employeeCode: 'E-NEW' }],
      ['a login email', { loginEmail: 'x@acme.vn' }],
    ])('refuses a body that names %s: an event with a day it takes effect, not a correction', async (_name, extra) => {
      const id = await h.person('MNT5');
      const before = await rowOf(id);

      const response = await patch(id, { fullName: 'Changed', ...extra }).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await rowOf(id)).toEqual(before);
    });

    it('refuses a request that names no official field', async () => {
      const id = await h.person('MNT6');

      expect(codeOf(await patch(id, {}).expect(422))).toBe('EMPLOYEE.UPDATE_EMPTY');
    });

    it('answers 404 for a person who does not exist and 422 for an id that is not one', async () => {
      expect(codeOf(await patch(randomUUID(), { fullName: 'Nobody' }).expect(404))).toBe('EMPLOYEE.NOT_FOUND');
      expect(codeOf(await patch('not-an-id', { fullName: 'Nobody' }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('the work email', () => {
    it('is normalized and must be free, like a row of the file, and a retyped version of the own email is not "taken"', async () => {
      const first = await h.person('MNT7');
      const second = await h.person('MNT8');

      const taken = await patch(second, { workEmail: '  MNT7+Alias@ACME.vn ' }).expect(422);
      const retyped = await patch(first, { workEmail: 'Mnt7@Acme.vn' }).expect(200);

      expect(codeOf(taken)).toBe('EMPLOYEE.ROW_INVALID');
      expect(reasonsOf(taken)).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      expect((await rowOf(second)).work_email).toBe('mnt8@acme.vn');
      expect(dataOf(retyped).workEmail).toBe('Mnt7@Acme.vn');
      expect((await rowOf(first)).normalized_work_email).toBe('mnt7@acme.vn');
    });

    it('may be removed, and a bad address is refused as a malformed request', async () => {
      const id = await h.person('MNT9');

      expect(dataOf(await patch(id, { workEmail: null }).expect(200)).workEmail).toBeNull();
      expect(codeOf(await patch(id, { workEmail: 'not an email' }).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('does not change the login email of the account the person has (FR-8.6)', async () => {
      const before = (
        await h.ctx.sql.query<{ login_email: string }>(`SELECT login_email FROM app_users WHERE id = $1`, [
          h.finance.appUserId,
        ])
      ).rows[0].login_email;

      await patch(h.finance.employeeId, { workEmail: 'finance.new@acme.vn' }).expect(200);

      const after = (
        await h.ctx.sql.query<{ login_email: string }>(`SELECT login_email FROM app_users WHERE id = $1`, [
          h.finance.appUserId,
        ])
      ).rows[0].login_email;
      expect(after).toBe(before);
      expect((await rowOf(h.finance.employeeId)).work_email).toBe('finance.new@acme.vn');
    });
  });

  describe('the hire date, only while it has not come', () => {
    it('is changed while it is still to come, and refused when it has passed or would move into the past', async () => {
      const future = await h.person('MNT10');
      await h.ctx.sql.query(`UPDATE employees SET hire_date = '2099-01-01' WHERE id = $1`, [future]);
      const past = await h.person('MNT11');

      const changed = await patch(future, { hireDate: '2099-06-01' }).expect(200);
      const intoPast = await patch(future, { hireDate: '2000-01-01' }).expect(422);
      const passed = await patch(past, { hireDate: '2099-06-01' }).expect(422);

      expect(dataOf(changed).hireDate).toBe('2099-06-01');
      expect(reasonsOf(intoPast)).toEqual([{ field: 'hireDate', code: 'HIRE_DATE_IN_PAST' }]);
      expect(reasonsOf(passed)).toEqual([{ field: 'hireDate', code: 'HIRE_DATE_LOCKED' }]);
      expect((await rowOf(future)).hire_date).toBe('2099-06-01');
      expect((await rowOf(past)).hire_date).toBe('2020-01-01');
    });
  });

  describe('the record of the Super Admin who is asking (QĐ-87c, F19)', () => {
    it('is refused with 403 EMPLOYEE.SELF_CHANGE_FORBIDDEN, which points only to the controlled procedure, and writes nothing', async () => {
      const own = h.seed.superAdmin.employeeId;
      const before = await rowOf(own);

      const refused = await patch(own, { fullName: 'Self Edit' }).expect(403);

      expect(codeOf(refused)).toBe('EMPLOYEE.SELF_CHANGE_FORBIDDEN');
      const message = (refused.body as { error: { message: string } }).error.message;
      expect(message).toContain('pnpm ops:record-super-admin-event profile-correct');
      expect(message).not.toMatch(/IT Admin|another/i);
      expect(await rowOf(own)).toEqual(before);
      expect(await auditOf(own)).toEqual([]);
      // Even a body that would be refused for another reason is answered by the role first, not by the row.
      expect(codeOf(await patch(own, { jobTitle: 'x'.repeat(256) }).expect(403))).toBe(
        'EMPLOYEE.SELF_CHANGE_FORBIDDEN',
      );
    });

    it('lets the Super Admin correct anybody else, an IT Admin included, whatever the department says', async () => {
      await patch(h.it1.employeeId, { fullName: 'Edited By The Super Admin' }).expect(200);

      expect((await rowOf(h.it1.employeeId)).full_name).toBe('Edited By The Super Admin');
      expect((await auditOf(h.it1.employeeId)).at(-1)).toMatchObject({
        actor_app_user_id: h.seed.superAdmin.appUserId,
      });
    });
  });
});
