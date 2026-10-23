import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, createActivatedAccount } from '../support/api-accounts';
import { HR_BASIS } from '../support/hr-basis';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

interface MaintainedWire {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  employmentType: string;
  hireDate: string;
  status: string;
}

/** US-02-02 AC-19 (QĐ-82m INF-20): the IT Admin corrects the official fields of a record that exists, on an HR basis. */
describe('correcting the official fields of an employee over HTTP (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;

  beforeAll(async () => {
    await h.start();
    // it1 is the IT Admin in charge of the seed department; it2 is another IT Admin who can stand in for them.
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $1 WHERE id = $2`, [
      h.it1.employeeId,
      h.seed.departmentId,
    ]);
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const superAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const patch = (id: string, body: object, headers: Record<string, string> = h.as(h.it1)) =>
    request(h.server()).patch(`/api/v1/employees/${id}`).set(headers).send(body);
  const withBasis = (body: object) => ({ ...body, hrBasis: HR_BASIS });
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
        status: string;
      }>(
        `SELECT full_name, work_email, normalized_work_email, employment_type, to_char(hire_date, 'YYYY-MM-DD') AS hire_date, status
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

  it('lets the IT Admin in charge change the name, and records who, the values before and after, and the HR basis (AC-19)', async () => {
    const id = await h.person('MNT1');

    const response = await patch(id, withBasis({ fullName: 'Nguyễn Văn A' })).expect(200);

    expect((response.body as { message: string }).message).toBe('EMPLOYEE.UPDATED');
    expect(dataOf(response)).toMatchObject({ id, employeeCode: 'MNT1', fullName: 'Nguyễn Văn A', status: 'ACTIVE' });
    expect((await rowOf(id)).full_name).toBe('Nguyễn Văn A');
    expect(await auditOf(id)).toEqual([
      {
        actor_app_user_id: h.it1.appUserId,
        actor_roles: ['IT_ADMIN'],
        before: { employeeCode: 'MNT1', fullName: 'Person MNT1' },
        after: { fullName: 'Nguyễn Văn A', hrBasis: HR_BASIS, byItAdminInCharge: true, selfExecuted: false },
      },
    ]);
  });

  it('lets another IT Admin do it, and says in the audit that they are not the one in charge', async () => {
    it2 = await createActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      roles: ['IT_ADMIN'],
      admin: h.admin,
    });
    const id = await h.person('MNT2');

    await patch(id, withBasis({ employmentType: 'CONTRACTOR' }), h.as(it2)).expect(200);

    expect((await rowOf(id)).employment_type).toBe('CONTRACTOR');
    expect((await auditOf(id))[0]).toMatchObject({
      actor_app_user_id: it2.appUserId,
      before: { employmentType: 'STAFF' },
      after: { employmentType: 'CONTRACTOR', byItAdminInCharge: false, selfExecuted: false },
    });
  });

  it('changes nothing and writes no audit event when the values are the ones the record already has', async () => {
    const id = await h.person('MNT3');

    await patch(id, withBasis({ fullName: 'Person MNT3', employmentType: 'STAFF' })).expect(200);

    expect(await auditOf(id)).toEqual([]);
  });

  describe('the HR basis is required', () => {
    it.each([
      ['no HR basis', undefined],
      ['no type', { ...HR_BASIS, type: undefined }],
      ['no reference', { ...HR_BASIS, reference: '' }],
      ['no issuer', { ...HR_BASIS, issuer: undefined }],
      ['no date of issue', { ...HR_BASIS, issuedOn: undefined }],
    ])('refuses %s, names what is missing, and writes nothing', async (_name, hrBasis) => {
      const id = await h.person(`MNT-B${randomUUID().slice(0, 6)}`);
      const before = await rowOf(id);

      const response = await patch(id, { fullName: 'Changed', hrBasis }).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).toMatch(/hrBasis|type|reference|issuer|issuedOn/);
      expect(await rowOf(id)).toEqual(before);
      expect(await auditOf(id)).toEqual([]);
    });
  });

  describe('who may do it, and what may not be changed', () => {
    it('is not an operation of the Super Admin, who only creates records, nor of Finance, an employee or a department head', async () => {
      const id = await h.person('MNT4');
      const before = await rowOf(id);

      for (const headers of [superAdmin(), h.as(h.finance), h.as(h.employee)]) {
        expect(codeOf(await patch(id, withBasis({ fullName: 'Nope' }), headers).expect(403))).toBe(
          'AUTHORIZATION.FORBIDDEN',
        );
      }

      expect(await rowOf(id)).toEqual(before);
    });

    it.each([
      ['a department', { departmentCode: 'P-OPS' }],
      ['a job title', { jobTitleId: randomUUID() }],
      ['a status', { status: 'TERMINATED' }],
      ['the employee code', { employeeCode: 'E-NEW' }],
      ['a login email', { loginEmail: 'x@acme.vn' }],
    ])('refuses a body that names %s: an event with a day it takes effect, not a correction', async (_name, extra) => {
      const id = await h.person('MNT5');
      const before = await rowOf(id);

      const response = await patch(id, withBasis({ fullName: 'Changed', ...extra })).expect(422);

      expect(codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await rowOf(id)).toEqual(before);
    });

    it('refuses a request that names no official field', async () => {
      const id = await h.person('MNT6');

      expect(codeOf(await patch(id, withBasis({})).expect(422))).toBe('EMPLOYEE.UPDATE_EMPTY');
    });

    it('answers 404 for a person who does not exist and 422 for an id that is not one', async () => {
      expect(codeOf(await patch(randomUUID(), withBasis({ fullName: 'Nobody' })).expect(404))).toBe(
        'EMPLOYEE.NOT_FOUND',
      );
      expect(codeOf(await patch('not-an-id', withBasis({ fullName: 'Nobody' })).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('the work email', () => {
    it('is normalized and must be free, like a row of the file, and a retyped version of the own email is not "taken"', async () => {
      const first = await h.person('MNT7');
      const second = await h.person('MNT8');

      const taken = await patch(second, withBasis({ workEmail: '  MNT7+Alias@ACME.vn ' })).expect(422);
      const retyped = await patch(first, withBasis({ workEmail: 'Mnt7@Acme.vn' })).expect(200);

      expect(codeOf(taken)).toBe('EMPLOYEE.ROW_INVALID');
      expect(reasonsOf(taken)).toEqual([{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }]);
      expect((await rowOf(second)).work_email).toBe('mnt8@acme.vn');
      expect(dataOf(retyped).workEmail).toBe('Mnt7@Acme.vn');
      expect((await rowOf(first)).normalized_work_email).toBe('mnt7@acme.vn');
    });

    it('may be removed, and a bad address is refused as a malformed request', async () => {
      const id = await h.person('MNT9');

      expect(dataOf(await patch(id, withBasis({ workEmail: null })).expect(200)).workEmail).toBeNull();
      expect(codeOf(await patch(id, withBasis({ workEmail: 'not an email' })).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('does not change the login email of the account the person has (FR-8.6)', async () => {
      const before = (
        await h.ctx.sql.query<{ login_email: string }>(`SELECT login_email FROM app_users WHERE id = $1`, [
          h.finance.appUserId,
        ])
      ).rows[0].login_email;

      await patch(h.finance.employeeId, withBasis({ workEmail: 'finance.new@acme.vn' })).expect(200);

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

      const changed = await patch(future, withBasis({ hireDate: '2099-06-01' })).expect(200);
      const intoPast = await patch(future, withBasis({ hireDate: '2000-01-01' })).expect(422);
      const passed = await patch(past, withBasis({ hireDate: '2099-06-01' })).expect(422);

      expect(dataOf(changed).hireDate).toBe('2099-06-01');
      expect(reasonsOf(intoPast)).toEqual([{ field: 'hireDate', code: 'HIRE_DATE_IN_PAST' }]);
      expect(reasonsOf(passed)).toEqual([{ field: 'hireDate', code: 'HIRE_DATE_LOCKED' }]);
      expect((await rowOf(future)).hire_date).toBe('2099-06-01');
      expect((await rowOf(past)).hire_date).toBe('2020-01-01');
    });
  });

  describe('the record of the IT Admin who is asking (SoD-5, QĐ-77m)', () => {
    it('is changed by another IT Admin when one can act, and by the IT Admin themselves only when nobody else can, flagged as such', async () => {
      // it2 exists and is usable: it1 may not change their own record.
      const refused = await patch(h.it1.employeeId, withBasis({ fullName: 'Self Edit' })).expect(403);
      expect(codeOf(refused)).toBe('EMPLOYEE.ANOTHER_IT_ADMIN_NEEDED');
      expect((await rowOf(h.it1.employeeId)).full_name).not.toBe('Self Edit');

      await patch(h.it1.employeeId, withBasis({ fullName: 'Edited By Other' }), h.as(it2)).expect(200);
      expect((await rowOf(h.it1.employeeId)).full_name).toBe('Edited By Other');

      // Only it1 is left: the IT Admin may change their own record, and the audit says it was self-executed.
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [it2.appUserId]);
      await patch(h.it1.employeeId, withBasis({ fullName: 'Self Edit' })).expect(200);

      const events = await auditOf(h.it1.employeeId);
      expect(events.at(-1)).toMatchObject({
        actor_app_user_id: h.it1.appUserId,
        after: { fullName: 'Self Edit', selfExecuted: true, byItAdminInCharge: true },
      });
    });
  });
});
