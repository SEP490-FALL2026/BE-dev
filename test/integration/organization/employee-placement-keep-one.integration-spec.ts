import { Client } from 'pg';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { DepartmentHarness } from '../../support/department-harness';

describe('employee_placements_keep_one trigger (INV-20) (integration, real PostgreSQL)', () => {
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

  it('refuses deletion of the sole placement of an employee with 23001 restrict_violation', async () => {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-K1' })).expect(201));
    const emp = h.dataOf(
      await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-K1',
          fullName: 'Keep One Person',
          workEmail: 'k1@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
          departmentCode: dept.code,
        })
        .expect(201),
    );

    const { rows } = await h.ctx.sql.query<{ id: string }>(
      'SELECT id FROM employee_placements WHERE employee_id = $1',
      [emp.id],
    );
    expect(rows).toHaveLength(1);
    const placementId = rows[0].id;

    const code = await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId]);
    expect(code).toBe('23001');

    const check = await h.ctx.sql.query('SELECT id FROM employee_placements WHERE id = $1', [placementId]);
    expect(check.rowCount).toBe(1);
  });

  it('allows deletion of a placement when another placement remains for the same employee', async () => {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-K2' })).expect(201));
    const emp = h.dataOf(
      await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-K2',
          fullName: 'Keep Two Person',
          workEmail: 'k2@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
          departmentCode: dept.code,
        })
        .expect(201),
    );

    const { rows } = await h.ctx.sql.query<{ id: string }>(
      'SELECT id FROM employee_placements WHERE employee_id = $1',
      [emp.id],
    );
    const firstPlacementId = rows[0].id;

    const futureFrom = '2027-01-01';
    // Close the first placement at futureFrom to satisfy employee_placements_no_overlap
    await h.ctx.sql.query('UPDATE employee_placements SET valid_to = $2::date WHERE id = $1', [
      firstPlacementId,
      futureFrom,
    ]);

    const secondPlacement = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date)
         RETURNING id`,
        [h.seed.organizationId, emp.id, dept.id, futureFrom],
      )
    ).rows[0].id;

    // Deleting the second placement succeeds because the initial placement remains
    const code = await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [secondPlacement]);
    expect(code).toBeNull();

    const remaining = await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [emp.id]);
    expect(remaining.rowCount).toBe(1);
  });

  it('refuses concurrent deletion when both sessions try to delete the last placement', async () => {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-K3' })).expect(201));
    const emp = h.dataOf(
      await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-K3',
          fullName: 'Keep Race Person',
          workEmail: 'k3@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
          departmentCode: dept.code,
        })
        .expect(201),
    );

    const p1 = (
      await h.ctx.sql.query<{ id: string }>('SELECT id FROM employee_placements WHERE employee_id = $1', [emp.id])
    ).rows[0].id;

    const futureFrom = '2027-06-01';
    await h.ctx.sql.query('UPDATE employee_placements SET valid_to = $2::date WHERE id = $1', [p1, futureFrom]);

    const p2 = (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date)
         RETURNING id`,
        [h.seed.organizationId, emp.id, dept.id, futureFrom],
      )
    ).rows[0].id;

    const clientA = new Client({ connectionString: h.ctx.database.url });
    const clientB = new Client({ connectionString: h.ctx.database.url });
    await clientA.connect();
    await clientB.connect();

    try {
      await clientA.query('BEGIN');
      await clientB.query('BEGIN');

      // Client A deletes p1 - takes lock on employees FOR UPDATE
      await clientA.query('DELETE FROM employee_placements WHERE id = $1', [p1]);

      // Client B attempts to delete p2 - will wait on employees row lock
      const clientBPromise = clientB.query('DELETE FROM employee_placements WHERE id = $1', [p2]);

      // Give client B a moment to wait on the lock
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Client A commits, releasing the employee lock
      await clientA.query('COMMIT');

      // Client B now unblocks and should fail with 23001 because p1 is gone
      await expect(clientBPromise).rejects.toMatchObject({ code: '23001' });
      await clientB.query('ROLLBACK');
    } finally {
      await clientA.end();
      await clientB.end();
    }
  });

  it('still raises 55000 when placement has been told to organization (history guard runs first)', async () => {
    const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
    const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-K4' })).expect(201));
    const emp = h.dataOf(
      await h
        .api()
        .post('/api/v1/employees')
        .set(h.asAdmin())
        .send({
          employeeCode: 'NV-K4',
          fullName: 'History Person',
          workEmail: 'k4@acme.vn',
          employmentType: 'STAFF',
          hireDate: today,
          departmentCode: dept.code,
        })
        .expect(201),
    );

    const placementId = (
      await h.ctx.sql.query<{ id: string }>('SELECT id FROM employee_placements WHERE employee_id = $1', [emp.id])
    ).rows[0].id;

    await h.ctx.sql.query(
      `INSERT INTO organization_change_announcements (id, organization_id, kind, subject_id, effective_on)
       VALUES (gen_random_uuid(), $1, 'PLACEMENT_START', $2, $3::date)`,
      [h.seed.organizationId, placementId, today],
    );

    const code = await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId]);
    expect(code).toBe('55000');
  });

  describe('offboarding_cases CHECK constraints and trigger exception (Phase D)', () => {
    it('enforces offboarding_cases_unplaced_no_head CHECK constraint (23514)', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const emp = h.dataOf(
        await h
          .api()
          .post('/api/v1/employees')
          .set(h.asAdmin())
          .send({
            employeeCode: 'NV-UNP1',
            fullName: 'Unplaced No Head',
            workEmail: 'unp1@acme.vn',
            employmentType: 'STAFF',
            hireDate: today,
            departmentCode: null,
          })
          .expect(201),
      );

      // Inserting case with department_id = NULL and head_handover NOT NULL fails CHECK
      const code = await sqlState(
        h.ctx.sql,
        `INSERT INTO offboarding_cases (
           id, organization_id, employee_id, department_id, prior_work_state,
           last_working_day, departure_effective_on, handover_due_on, grounds_type, grounds_reference,
           grounds_issuer, grounds_issued_on, head_handover
         ) VALUES (
           gen_random_uuid(), $1, $2, NULL, 'WORKING',
           $3::date, $3::date, $3::date, 'RESIGNATION', 'REF-1', 'Issuer', $3::date, '{"head": true}'::jsonb
         )`,
        [h.seed.organizationId, emp.id, today],
      );
      expect(code).toBe('23514');
    });

    it('enforces offboarding_cases_cancelled_placement CHECK constraint (23514)', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-UNP2' })).expect(201));
      const emp = h.dataOf(
        await h
          .api()
          .post('/api/v1/employees')
          .set(h.asAdmin())
          .send({
            employeeCode: 'NV-UNP2',
            fullName: 'Unplaced Partial',
            workEmail: 'unp2@acme.vn',
            employmentType: 'STAFF',
            hireDate: today,
            departmentCode: null,
          })
          .expect(201),
      );

      const fakePlacementId = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

      // 1. Missing cancelled_placement_from
      const code1 = await sqlState(
        h.ctx.sql,
        `INSERT INTO offboarding_cases (
           id, organization_id, employee_id, department_id, prior_work_state,
           last_working_day, departure_effective_on, handover_due_on, grounds_type, grounds_reference,
           grounds_issuer, grounds_issued_on, cancelled_placement_id, cancelled_placement_department_id
         ) VALUES (
           gen_random_uuid(), $1, $2, NULL, 'WORKING',
           $3::date, $3::date, $3::date, 'RESIGNATION', 'REF-2', 'Issuer', $3::date, $4::uuid, $5::uuid
         )`,
        [h.seed.organizationId, emp.id, today, fakePlacementId, dept.id],
      );
      expect(code1).toBe('23514');

      // 2. Has cancelled placement columns BUT department_id is NOT NULL
      const code2 = await sqlState(
        h.ctx.sql,
        `INSERT INTO offboarding_cases (
           id, organization_id, employee_id, department_id, prior_work_state,
           last_working_day, departure_effective_on, handover_due_on, grounds_type, grounds_reference,
           grounds_issuer, grounds_issued_on, cancelled_placement_id, cancelled_placement_department_id, cancelled_placement_from
         ) VALUES (
           gen_random_uuid(), $1, $2, $5::uuid, 'WORKING',
           $3::date, $3::date, $3::date, 'RESIGNATION', 'REF-3', 'Issuer', $3::date, $4::uuid, $5::uuid, $3::date
         )`,
        [h.seed.organizationId, emp.id, today, fakePlacementId, dept.id],
      );
      expect(code2).toBe('23514');
    });

    it('allows sole placement deletion when valid_from is future and uncancelled offboarding case names it', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-UNP3' })).expect(201));
      const emp = h.dataOf(
        await h
          .api()
          .post('/api/v1/employees')
          .set(h.asAdmin())
          .send({
            employeeCode: 'NV-UNP3',
            fullName: 'Future Placement Leaver',
            workEmail: 'unp3@acme.vn',
            employmentType: 'STAFF',
            hireDate: today,
            departmentCode: null,
          })
          .expect(201),
      );

      // Create a future placement
      const futureFrom = '2028-01-01';
      const placementId = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date)
           RETURNING id`,
          [h.seed.organizationId, emp.id, dept.id, futureFrom],
        )
      ).rows[0].id;

      // Deleting directly fails without offboarding case
      expect(await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId])).toBe('23001');

      // Insert uncancelled offboarding case naming cancelled_placement_id
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO offboarding_cases (
           id, organization_id, employee_id, department_id, prior_work_state,
           last_working_day, departure_effective_on, handover_due_on, grounds_type, grounds_reference,
           grounds_issuer, grounds_issued_on, cancelled_placement_id, cancelled_placement_department_id, cancelled_placement_from,
           recorded_by_app_user_id
         ) VALUES (
           gen_random_uuid(), $1, $2, NULL, 'WORKING',
           $3::date, $3::date + 1, $3::date, 'RESIGNATION', 'REF-4', 'Issuer', $3::date, $4::uuid, $5::uuid, $6::date,
           $7::uuid
         ) RETURNING id`,
        [h.seed.organizationId, emp.id, today, placementId, dept.id, futureFrom, h.seed.superAdmin.appUserId],
      );

      // Now deleting the placement succeeds!
      const code = await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId]);
      expect(code).toBeNull();

      const count = await h.ctx.sql.query<{ count: string }>(
        'SELECT count(*) FROM employee_placements WHERE employee_id = $1',
        [emp.id],
      );
      expect(Number(count.rows[0].count)).toBe(0);
    });

    it('refuses deletion if offboarding case has already been cancelled', async () => {
      const today = await h.ctx.app.get(OrganizationReadApi).businessToday();
      const dept = h.dataOf(await h.createDepartment(h.departmentBody({ code: 'P-UNP4' })).expect(201));
      const emp = h.dataOf(
        await h
          .api()
          .post('/api/v1/employees')
          .set(h.asAdmin())
          .send({
            employeeCode: 'NV-UNP4',
            fullName: 'Cancelled Case Leaver',
            workEmail: 'unp4@acme.vn',
            employmentType: 'STAFF',
            hireDate: today,
            departmentCode: null,
          })
          .expect(201),
      );

      const futureFrom = '2028-02-01';
      const placementId = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date)
           RETURNING id`,
          [h.seed.organizationId, emp.id, dept.id, futureFrom],
        )
      ).rows[0].id;

      // Insert case that is ALREADY cancelled (cancelled_at IS NOT NULL)
      await h.ctx.sql.query(
        `INSERT INTO offboarding_cases (
           id, organization_id, employee_id, department_id, state, prior_work_state,
           last_working_day, departure_effective_on, handover_due_on, grounds_type, grounds_reference,
           grounds_issuer, grounds_issued_on, cancelled_placement_id, cancelled_placement_department_id, cancelled_placement_from,
           cancelled_at, cancelled_by_app_user_id, cancel_reason, recorded_by_app_user_id
         ) VALUES (
           gen_random_uuid(), $1, $2, NULL, 'CANCELLED', 'WORKING',
           $3::date, $3::date + 1, $3::date, 'RESIGNATION', 'REF-5', 'Issuer', $3::date, $4::uuid, $5::uuid, $6::date,
           now(), $7::uuid, 'Reason for cancellation', $7::uuid
         )`,
        [h.seed.organizationId, emp.id, today, placementId, dept.id, futureFrom, h.seed.superAdmin.appUserId],
      );

      // Deleting placement still fails with 23001
      expect(await sqlState(h.ctx.sql, 'DELETE FROM employee_placements WHERE id = $1', [placementId])).toBe('23001');
    });
  });
});
