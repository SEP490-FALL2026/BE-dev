import { Client } from 'pg';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { bodyOf } from '../../support/api-body';
import { DepartmentHarness } from '../../support/department-harness';

/** The correction of the first placement (`QĐ-113e`) against real PostgreSQL: the route, the audit and the trigger that lets only this change through. */
describe('PATCH /employees/{id}/first-placement (integration, real PostgreSQL)', () => {
  const h = new DepartmentHarness();

  const sqlState = async (
    client: Pick<Client, 'query'>,
    sql: string,
    params: unknown[] = [],
  ): Promise<string | null> => {
    try {
      await client.query(sql, params);
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    }
  };

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterAll(async () => {
    await h.stop();
  });

  async function person(code: string, departmentCode: string): Promise<string> {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const created = h.dataOf(
      await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: code,
          fullName: `Person ${code}`,
          workEmail: `${code.toLowerCase()}@acme.vn`,
          employmentType: 'STAFF',
          hireDate: today,
          departmentCode,
        })
        .expect(201),
    );
    return created.id;
  }

  const placementOf = async (employeeId: string) =>
    (
      await h.ctx.sql.query<{ id: string; department_id: string; valid_from: string }>(
        'SELECT id, department_id, valid_from::text AS valid_from FROM employee_placements WHERE employee_id = $1',
        [employeeId],
      )
    ).rows[0];

  it('changes the department and the day of a placement that starts after today, audits it and refuses what already took effect', async () => {
    const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-FC1' })).expect(201));
    const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-FC2' })).expect(201));
    const employeeId = await person('NV-FC1', from.code);

    // Placed today: already in effect, so a change of department is a transfer.
    const effective = await h
      .api()
      .patch(`/api/v1/employees/${employeeId}/first-placement`)
      .set(h.asAdmin())
      .send({ departmentId: to.id, reason: 'Wrong team' })
      .expect(409);
    expect(bodyOf(effective).error.code).toBe('EMPLOYEE.FIRST_PLACEMENT_ALREADY_EFFECTIVE');
    const placement = await placementOf(employeeId);
    expect(
      await sqlState(h.ctx.sql, 'UPDATE employee_placements SET department_id = $2 WHERE id = $1', [
        placement.id,
        to.id,
      ]),
    ).toBe('55000');

    // Dated for a later day (a plain write: nothing has been told yet).
    await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from + 30 WHERE id = $1', [placement.id]);
    const later = (await placementOf(employeeId)).valid_from;
    const { rows } = await h.ctx.sql.query<{ day: string }>('SELECT ($1::date + 5)::text AS day', [later]);

    const response = await h
      .api()
      .patch(`/api/v1/employees/${employeeId}/first-placement`)
      .set(h.asAdmin())
      .send({ departmentId: to.id, effectiveFrom: rows[0].day, reason: 'Wrong team' })
      .expect(200);

    const view = response.body as { data: { department: { id: string }; memberSince: string } };
    expect(view.data.department.id).toBe(to.id);
    expect(view.data.memberSince).toBe(rows[0].day);
    const after = await placementOf(employeeId);
    expect(after).toMatchObject({ id: placement.id, department_id: to.id, valid_from: rows[0].day });
    const audit = await h.ctx.sql.query(
      `SELECT 1 FROM audit_events WHERE action = 'EMPLOYEE.FIRST_PLACEMENT_CORRECTED' AND resource_id = $1`,
      [employeeId],
    );
    expect(audit.rowCount).toBe(1);
  });

  /** A person whose only placement starts 30 days after today and has been told to nobody: what the trigger lets be corrected. */
  async function futurePerson(code: string, departmentCode: string) {
    const employeeId = await person(code, departmentCode);
    const placement = await placementOf(employeeId);
    await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from + 30 WHERE id = $1', [placement.id]);

    return { employeeId, placementId: placement.id };
  }

  const tell = (placementId: string) =>
    h.ctx.sql.query(
      `INSERT INTO organization_change_announcements (id, organization_id, kind, subject_id, effective_on)
       SELECT gen_random_uuid(), organization_id, 'PLACEMENT_START', id, valid_from FROM employee_placements WHERE id = $1`,
      [placementId],
    );

  describe('the trigger employee_placements_keep_history (QĐ-113e), straight in SQL', () => {
    const changeDepartment = (placementId: string, departmentId: string) =>
      sqlState(h.ctx.sql, 'UPDATE employee_placements SET department_id = $2 WHERE id = $1', [
        placementId,
        departmentId,
      ]);

    it('lets a lone future placement that nobody was told of change department, and keeps its id', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR1' })).expect(201));
      const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR2' })).expect(201));
      const { employeeId, placementId } = await futurePerson('NV-TR1', from.code);

      expect(await changeDepartment(placementId, to.id)).toBeNull();

      expect(await placementOf(employeeId)).toMatchObject({ id: placementId, department_id: to.id });
    });

    it('refuses the change when the person has a second placement, for either of the two', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR3' })).expect(201));
      const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR4' })).expect(201));
      const { employeeId, placementId } = await futurePerson('NV-TR3', from.code);
      await h.ctx.sql.query('UPDATE employee_placements SET valid_to = valid_from + 30 WHERE id = $1', [placementId]);
      const second = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
           SELECT gen_random_uuid(), organization_id, employee_id, department_id, valid_to
             FROM employee_placements WHERE id = $1
           RETURNING id`,
          [placementId],
        )
      ).rows[0].id;

      expect(await changeDepartment(placementId, to.id)).toBe('55000');
      expect(await changeDepartment(second, to.id)).toBe('55000');
      expect((await placementOf(employeeId)).department_id).toBe(from.id);
    });

    it('refuses the change once the start was told (PLACEMENT_START), and the delete stops at the history guard', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR5' })).expect(201));
      const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR6' })).expect(201));
      const { placementId } = await futurePerson('NV-TR5', from.code);
      await tell(placementId);

      expect(await changeDepartment(placementId, to.id)).toBe('55000');
      expect(await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId])).toBe('55000');
    });

    it('refuses the change once a department transfer opens or closes the placement', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR7' })).expect(201));
      const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR8' })).expect(201));
      const { employeeId, placementId } = await futurePerson('NV-TR7', from.code);
      await h.ctx.sql.query(
        `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id, effective_on, status,
           effective_at, closes_placement_id, opens_placement_id, grounds_type, grounds_reference, grounds_issuer, grounds_issued_on,
           recorded_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE + 90, 'EFFECTIVE', now(), $5, gen_random_uuid(), 'DECISION', 'D-1', 'HR',
           CURRENT_DATE, $6)`,
        [h.seed.organizationId, employeeId, from.id, to.id, placementId, h.seed.superAdmin.appUserId],
      );

      expect(await changeDepartment(placementId, to.id)).toBe('55000');
    });

    it('takes "today" in the time zone of the organization, not the one of the server', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TR9' })).expect(201));
      const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TRA' })).expect(201));
      const { placementId } = await futurePerson('NV-TR9', from.code);
      // The time zone of an organization cannot change after installation, so the day is read in the zone it has.
      const zone = (
        await h.ctx.sql.query<{ time_zone: string }>('SELECT time_zone FROM organizations WHERE id = $1', [
          h.seed.organizationId,
        ])
      ).rows[0].time_zone;
      const dayIn = async (offset: number) =>
        (
          await h.ctx.sql.query<{ day: string }>('SELECT ((now() AT TIME ZONE $1)::date + $2::int)::text AS day', [
            zone,
            offset,
          ])
        ).rows[0].day;
      const startOn = (day: string) =>
        h.ctx.sql.query('UPDATE employee_placements SET valid_from = $2::date WHERE id = $1', [placementId, day]);

      // Starting today in the zone of the organization, the placement is in effect there: no change of department.
      await startOn(await dayIn(0));
      expect(await changeDepartment(placementId, to.id)).toBe('55000');

      // Starting tomorrow there, it is still ahead: the department may change.
      await startOn(await dayIn(1));
      expect(await changeDepartment(placementId, to.id)).toBeNull();
    });

    it('still refuses to delete the lone placement (keep_one), whether or not it may change department', async () => {
      const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TRB' })).expect(201));
      const { placementId } = await futurePerson('NV-TRB', from.code);

      expect(await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId])).toBe('23001');
    });
  });

  it('answers 409 ALREADY_EFFECTIVE, not 500, when the trigger refuses a change the service let through', async () => {
    const from = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TRC' })).expect(201));
    const to = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-TRD' })).expect(201));
    const { placementId, employeeId } = await futurePerson('NV-TRC', from.code);
    // The service reads no announcement; the trigger is the last guard.
    await tell(placementId);

    const response = await h
      .api()
      .patch(`/api/v1/employees/${employeeId}/first-placement`)
      .set(h.asAdmin())
      .send({ departmentId: to.id, reason: 'Wrong team' })
      .expect(409);

    expect(bodyOf(response).error.code).toBe('EMPLOYEE.FIRST_PLACEMENT_ALREADY_EFFECTIVE');
  });
});
