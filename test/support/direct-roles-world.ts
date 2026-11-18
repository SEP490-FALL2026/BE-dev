import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/**
 * The rows around the roles `MANAGER` and `SPENDING_APPROVER` as the release before `…_identity_direct_roles` wrote them, for the
 * suites that play that release (the preflight and the migration of `QĐ-93k(4)`): the spending approver is the open row of
 * `approval_role_holders`, a head is a head period, the other roles are grants. Plain SQL that runs on the schema before the
 * migration and names no value the new enum has. Nothing here asserts.
 */
export interface RolesWorld {
  organizationId: string;
  departments: Map<string, string>;
}

export interface RolesPerson {
  employeeId: string;
  employeeCode: string;
  appUserId: string | null;
}

export type AccountKind = 'ACTIVE' | 'LOCKED' | 'NOT_ACTIVATED' | false;

export async function rolesWorld(sql: Client): Promise<RolesWorld> {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );

  return { organizationId, departments: new Map() };
}

export async function addDepartment(sql: Client, world: RolesWorld, code: string): Promise<string> {
  const id = randomUUID();
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, $3, $3, now())`,
    [id, world.organizationId, code],
  );
  world.departments.set(code, id);

  return id;
}

/** An employee placed in the department from the start of the year, with an account of the kind asked (none by default). */
export async function addPerson(
  sql: Client,
  world: RolesWorld,
  spec: { code: string; department: string; account?: AccountKind; workState?: 'WORKING' | 'HANDING_OVER' },
): Promise<RolesPerson> {
  const employeeId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, work_state, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5, 'STAFF', '2026-01-01', $6::"EmployeeWorkState", now())`,
    [
      employeeId,
      world.organizationId,
      spec.code,
      `Person ${spec.code}`,
      `${spec.code.toLowerCase()}@acme.vn`,
      spec.workState ?? 'WORKING',
    ],
  );
  const departmentId = world.departments.get(spec.department);
  if (!departmentId) throw new Error(`Unknown department ${spec.department}`);
  await sql.query(
    `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
     VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-01')`,
    [world.organizationId, employeeId, departmentId],
  );

  let appUserId: string | null = null;
  const account = spec.account ?? false;
  if (account) {
    appUserId = randomUUID();
    await sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state,
                              email_verification_source, email_verified_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $5::"AppUserStatus", $6::"ActivationState",
               'INVITATION_REDEEMED', now(), now())`,
      [
        appUserId,
        world.organizationId,
        employeeId,
        `${spec.code.toLowerCase()}@acme.vn`,
        account === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
        account === 'NOT_ACTIVATED' ? 'INVITED' : 'ACTIVATED',
      ],
    );
  }

  return { employeeId, employeeCode: spec.code, appUserId };
}

/** `from`/`to` are `YYYY-MM-DD` days; a head for good from the start of the year by default. */
export async function addHeadPeriod(
  sql: Client,
  world: RolesWorld,
  spec: { department: string; employeeId: string; from?: string; to?: string | null },
): Promise<void> {
  await sql.query(
    `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5::date)`,
    [
      world.organizationId,
      world.departments.get(spec.department),
      spec.employeeId,
      spec.from ?? '2026-02-01',
      spec.to ?? null,
    ],
  );
}

/** Holds the approval role as the release before the migration kept it (the open row). */
export async function holdApprovalRole(
  sql: Client,
  world: RolesWorld,
  role: 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER',
  employeeId: string,
): Promise<void> {
  await sql.query(
    `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
     VALUES (gen_random_uuid(), $1, $2::"ApprovalRole", $3, now() - interval '1 day')`,
    [world.organizationId, role, employeeId],
  );
}

/** A role the account holds, as a grant (the three roles the release before the migration stored). */
export async function grantRoleAs(
  sql: Client,
  world: RolesWorld,
  appUserId: string,
  role: 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE' | 'EMPLOYEE',
): Promise<void> {
  await sql.query(
    `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, $3::"AppRole")`,
    [world.organizationId, appUserId, role],
  );
}

/** Leaves only the organization and its departments: the rows of the people, their accounts, grants and roles are removed. */
export async function clearPeople(sql: Client, world: RolesWorld): Promise<void> {
  const owned = [world.organizationId];
  await sql.query(`DELETE FROM role_grants WHERE organization_id = $1`, owned);
  await sql.query(`DELETE FROM department_head_periods WHERE organization_id = $1`, owned);
  // The table is dropped by a later migration (QĐ-93 removal of the approval roles): present only on the history before it.
  if (
    (await sql.query<{ t: string | null }>(`SELECT to_regclass('approval_role_holders')::text AS t`)).rows[0].t !== null
  ) {
    await sql.query(`DELETE FROM approval_role_holders WHERE organization_id = $1`, owned);
  }
  await sql.query(`DELETE FROM app_users WHERE organization_id = $1`, owned);
  await deleteAllPlacements(sql, world);
  await sql.query(`DELETE FROM employees WHERE organization_id = $1`, owned);
}

/**
 * Removes every placement of the world's organization for test cleanup. The keep-one trigger (`INV-20`) refuses to delete
 * the last placement of an employee, so inside one transaction the trigger is switched off (when the history applied has
 * it) and on again; the trigger itself is production code and stays as it is.
 */
async function deleteAllPlacements(sql: Client, world: RolesWorld): Promise<void> {
  const present = await sql.query(
    `SELECT 1 FROM pg_trigger WHERE tgname = 'employee_placements_keep_one' AND tgrelid = 'employee_placements'::regclass`,
  );
  await sql.query('BEGIN');
  try {
    if (present.rowCount)
      await sql.query(`ALTER TABLE employee_placements DISABLE TRIGGER employee_placements_keep_one`);
    await sql.query(`DELETE FROM employee_placements WHERE organization_id = $1`, [world.organizationId]);
    if (present.rowCount)
      await sql.query(`ALTER TABLE employee_placements ENABLE TRIGGER employee_placements_keep_one`);
    await sql.query('COMMIT');
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }
}
