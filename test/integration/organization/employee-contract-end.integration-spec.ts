import request from 'supertest';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * The last day of the contract of a person with a term (R-38, `INV-07`, the design of `qd96-100-approved-end-date`): the Super Admin writes it with
 * the official fields of the record, on the entry and on the correction; staff has none, it is never before the hire date, and a change of kind to
 * staff cannot keep one. The database says the same, for a writer that goes around the application.
 */
describe('the end of the contract of a person with a term (integration, R-38, INV-07)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  const auth = { Authorization: '' };
  const patch = (id: string, body: object) =>
    request(h.server())
      .patch(`/api/v1/employees/${id}`)
      .set({ ...auth, Authorization: `Bearer ${h.admin}` })
      .send(body);
  const enter = (body: object) =>
    request(h.server())
      .post('/api/v1/employees')
      .set({ ...auth, Authorization: `Bearer ${h.admin}` })
      .send(body);
  const reasonsOf = (response: request.Response) =>
    (response.body as { error: { details: { reasons: { field: string; code: string }[] } } }).error.details.reasons;
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{ employment_type: string; contract_end_date: string | null }>(
        `SELECT employment_type::text, contract_end_date::text FROM employees WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const changes = async (id: string) =>
    (
      await h.ctx.sql.query<{ before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
        `SELECT before, after FROM audit_events WHERE action = 'EMPLOYEE.OFFICIAL_FIELDS_CHANGED' AND resource_id = $1`,
        [id],
      )
    ).rows;
  const sqlStateOf = (failure: unknown): string | undefined => (failure as { code?: string } | null)?.code;
  const typed = async (code: string, employmentType: string): Promise<string> => {
    const id = await h.person(code);
    await h.ctx.sql.query(`UPDATE employees SET employment_type = $2 WHERE id = $1`, [id, employmentType]);

    return id;
  };

  it('gives an intern the end of their contract, shows it, and audits what it was and what it is', async () => {
    const id = await typed('CE1', 'INTERN');

    const done = await patch(id, { contractEndDate: '2099-01-31' }).expect(200);

    expect((done.body as { data: { contractEndDate: string } }).data.contractEndDate).toBe('2099-01-31');
    expect((await stored(id)).contract_end_date).toBe('2099-01-31');
    const [audit] = await changes(id);
    expect(await changes(id)).toHaveLength(1);
    expect(audit.before).toMatchObject({ contractEndDate: null });
    expect(audit.after).toEqual({ contractEndDate: '2099-01-31' });
  });

  it('clears it with null, and the same day again changes and audits nothing', async () => {
    const id = await typed('CE2', 'CONTRACTOR');
    await patch(id, { contractEndDate: '2099-03-31' }).expect(200);
    await patch(id, { contractEndDate: '2099-03-31' }).expect(200);
    expect(await changes(id)).toHaveLength(1);

    await patch(id, { contractEndDate: null }).expect(200);

    expect((await stored(id)).contract_end_date).toBeNull();
  });

  it('refuses an end for staff, an end before the hire date, and a change of kind to staff that keeps one: 422, nothing written', async () => {
    const staff = await h.person('CE3');
    const intern = await typed('CE4', 'INTERN');
    await patch(intern, { contractEndDate: '2099-01-31' }).expect(200);

    const forStaff = await patch(staff, { contractEndDate: '2099-01-31' }).expect(422);
    const early = await patch(intern, { contractEndDate: '2000-01-01' }).expect(422);
    const toStaff = await patch(intern, { employmentType: 'STAFF' }).expect(422);

    expect(reasonsOf(forStaff)).toEqual([{ field: 'contractEndDate', code: 'CONTRACT_END_NOT_APPLICABLE' }]);
    expect(reasonsOf(early)).toEqual([{ field: 'contractEndDate', code: 'CONTRACT_END_BEFORE_HIRE' }]);
    expect(reasonsOf(toStaff)).toEqual([{ field: 'contractEndDate', code: 'CONTRACT_END_NOT_APPLICABLE' }]);
    expect(await stored(staff)).toMatchObject({ contract_end_date: null });
    expect(await stored(intern)).toMatchObject({ employment_type: 'INTERN', contract_end_date: '2099-01-31' });
    // Going to staff and clearing the end in the same correction is fine.
    await patch(intern, { employmentType: 'STAFF', contractEndDate: null }).expect(200);
    expect(await stored(intern)).toMatchObject({ employment_type: 'STAFF', contract_end_date: null });
  });

  it('takes the end on the entry of a person with a term, and refuses it for staff or before the hire date, all reasons at once', async () => {
    const body = {
      fullName: 'Nguyen Intern',
      employmentType: 'INTERN',
      hireDate: '2099-01-10',
      contractEndDate: '2099-06-30',
    };

    const entered = await enter({ ...body, employeeCode: 'CE-NEW1' }).expect(201);
    const forStaff = await enter({ ...body, employeeCode: 'CE-NEW2', employmentType: 'STAFF' }).expect(422);
    const early = await enter({ ...body, employeeCode: 'CE-NEW3', contractEndDate: '2099-01-09' }).expect(422);
    const without = await enter({ ...body, employeeCode: 'CE-NEW4', contractEndDate: undefined }).expect(201);

    const id = (entered.body as { data: { id: string; contractEndDate: string } }).data;
    expect(id.contractEndDate).toBe('2099-06-30');
    expect((await stored(id.id)).contract_end_date).toBe('2099-06-30');
    expect(reasonsOf(forStaff)).toEqual([{ field: 'contractEndDate', code: 'CONTRACT_END_NOT_APPLICABLE' }]);
    expect(reasonsOf(early)).toEqual([{ field: 'contractEndDate', code: 'CONTRACT_END_BEFORE_HIRE' }]);
    expect((without.body as { data: { contractEndDate: string | null } }).data.contractEndDate).toBeNull();
  });

  it('is kept by PostgreSQL for a writer that goes around the application: staff has none, and it is never before the hire date', async () => {
    const staff = await h.person('CE5');
    const intern = await typed('CE6', 'INTERN');

    const forStaff = await h.ctx.sql
      .query(`UPDATE employees SET contract_end_date = '2099-01-31' WHERE id = $1`, [staff])
      .catch((failure: unknown) => failure);
    const early = await h.ctx.sql
      .query(`UPDATE employees SET contract_end_date = '1999-01-01' WHERE id = $1`, [intern])
      .catch((failure: unknown) => failure);

    expect([sqlStateOf(forStaff), sqlStateOf(early)]).toEqual(['23514', '23514']);
  });
});
