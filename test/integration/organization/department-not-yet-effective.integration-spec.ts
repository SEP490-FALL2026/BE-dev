import request from 'supertest';
import type { Department } from '../../support/request-harness';
import { TransferHarness } from '../../support/transfer-harness';

const h = new TransferHarness();

/**
 * `qd103-department-effective-year`, Task 3 (QĐ-104e(3), R-I10): a department made for next year takes nobody in, and has no head,
 * before the day it takes effect. A department made today takes effect today, so the tests move that day with SQL.
 */
describe('a department that takes effect later (integration, real PostgreSQL)', () => {
  let fresh: Department;
  let origin: Department;
  let effective: string;
  let counter = 0;

  const code = (prefix: string) => `${prefix}${(counter += 1)}`;
  const asAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const place = (employeeId: string, effectiveFrom: string) =>
    request(h.server())
      .post(`/api/v1/employees/${employeeId}/first-placements`)
      .set(asAdmin())
      .send({ departmentId: fresh.id, effectiveFrom });
  const assignHead = (employeeId: string, effectiveFrom: string) =>
    request(h.server())
      .post(`/api/v1/departments/${fresh.id}/head-assignments`)
      .set(asAdmin())
      .send({ employeeId, effectiveFrom });

  beforeAll(async () => {
    await h.start();
    origin = await h.departmentWithUnit('P-ORIGIN');
    fresh = await h.departmentWithUnit('P-FRESH');
    effective = h.day(400);
    await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [fresh.id, effective]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('turns away the first placement of a person before the day it takes effect, and takes them on that day (R-I10)', async () => {
    const person = await h.unplacedStaff(code('NYE'));

    const early = await place(person.employeeId, h.day(30)).expect(422);
    const exact = await place(person.employeeId, effective).expect(201);

    expect(h.codeOf(early)).toBe('DEPARTMENT.NOT_YET_EFFECTIVE');
    expect(h.detailsOf(early)).toEqual({ effectiveFrom: effective });
    expect(h.dataOf<{ memberSince: string }>(exact).memberSince).toBe(effective);
  });

  it('turns away a head that starts before the day it takes effect, and names one from that day', async () => {
    const person = await h.unplacedStaff(code('NYH'), 'MANAGER');
    await place(person.employeeId, effective).expect(201);

    const early = await assignHead(person.employeeId, h.day(30)).expect(422);
    await assignHead(person.employeeId, effective).expect(200);

    expect(h.codeOf(early)).toBe('DEPARTMENT.NOT_YET_EFFECTIVE');
    const periods = await h.ctx.sql.query<{ valid_from: string }>(
      `SELECT to_char(valid_from, 'YYYY-MM-DD') AS valid_from FROM department_head_periods WHERE department_id = $1`,
      [fresh.id],
    );
    expect(periods.rows.map((row) => row.valid_from)).toEqual([effective]);
  });

  it('turns away a transfer into it before the day it takes effect, and records one for that day (MF-3)', async () => {
    const mover = await h.veteran(origin, code('NYT'));
    const body = (effectiveOn: string) => ({
      employeeId: mover.employeeId,
      toDepartmentId: fresh.id,
      effectiveOn,
      groundsNote: h.groundsNote,
    });

    const early = await h.recordTransfer(body(h.day(30)));
    const exact = await h.recordTransfer(body(effective));

    expect([early.status, h.codeOf(early)]).toEqual([422, 'DEPARTMENT_TRANSFER.DEPARTMENT_NOT_YET_EFFECTIVE']);
    expect(exact.status).toBe(201);
  });

  it('does not take a person into it by hand before it takes effect (manual entry reports a department that takes nobody)', async () => {
    const refused = await request(h.server())
      .post('/api/v1/employees')
      .set(asAdmin())
      .send({
        employeeCode: code('NYM'),
        fullName: 'Not Yet',
        workEmail: `${code('nym')}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: h.today(),
        departmentCode: fresh.code,
      });

    expect(refused.status).toBe(422);
    expect(JSON.stringify(h.detailsOf(refused))).toContain('DEPARTMENT_INACTIVE');
  });

  it('keeps showing the day it takes effect on the department', async () => {
    const shown = await request(h.server()).get(`/api/v1/departments/${fresh.id}`).set(asAdmin()).expect(200);

    expect(h.dataOf<{ effectiveFrom: string }>(shown).effectiveFrom).toBe(effective);
  });
});
