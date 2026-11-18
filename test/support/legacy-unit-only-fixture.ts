import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/**
 * Data written by the code before migration `20261022120000_cost_centers_unit_only`, in the schema of that time: a
 * service account was charged to a Cost Center of kind COMPANY, Finance could split a shared subscription onto a COMPANY
 * Cost Center, and an employee import placed people in their department from the day of the import while the seat
 * baseline let a seat start on its real grant day, as far back as the hire date. Builders only: no assertion.
 */
export interface LegacyWorld {
  organizationId: string;
  /** Departments by code, each with the id of its UNIT Cost Center. */
  departments: Record<'OPS' | 'ENG', { id: string; unit: string }>;
  /** The COMPANY Cost Centers: one in use, one retired before the migration. */
  company: { active: string; inactive: string };
  jobTitleId: string;
  planId: string;
  /** A completed seat baseline import of the internal plan, which every legacy service account names. */
  importId: string;
  appUserId: string;
}

export interface LegacyPlacement {
  department: 'OPS' | 'ENG';
  from: string;
  to?: string;
}

/** The organization, its Cost Centers (two Units, an active and a retired COMPANY), two departments and an internal plan. */
export async function legacyWorld(sql: Client, timeZone: string): Promise<LegacyWorld> {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', $2, 'VND')`,
    [organizationId, timeZone],
  );
  const [opsUnit, engUnit, active, inactive] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await sql.query(
    `INSERT INTO cost_centers (id, organization_id, code, name, kind, status, deactivated_at) VALUES
       ($1, $5, 'CC-OPS', 'Operations', 'UNIT', 'ACTIVE', NULL),
       ($2, $5, 'CC-ENG', 'Engineering', 'UNIT', 'ACTIVE', NULL),
       ($3, $5, 'CC-CORP', 'Company', 'COMPANY', 'ACTIVE', NULL),
       ($4, $5, 'CC-OLD', 'Old company', 'COMPANY', 'INACTIVE', '2026-09-01T00:00:00Z')`,
    [opsUnit, engUnit, active, inactive, organizationId],
  );
  const [ops, eng] = [randomUUID(), randomUUID()];
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at) VALUES
       ($1, $3, 'OPS', 'Operations', $4, now()), ($2, $3, 'ENG', 'Engineering', $5, now())`,
    [ops, eng, organizationId, opsUnit, engUnit],
  );
  const jobTitleId = randomUUID();
  await sql.query(
    `INSERT INTO job_titles (id, organization_id, name, normalized_name, updated_at) VALUES ($1, $2, 'Admin', 'admin', now())`,
    [jobTitleId, organizationId],
  );
  const owner = await insertEmployee(sql, organizationId, 'E-OWNER', '2020-01-01');
  const applicationId = randomUUID();
  await sql.query(
    `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id,
       data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
     VALUES ($1, $2, 'INTERNAL', 'Build bot', 'build bot', $3, 'LOW', false, false, false, false)`,
    [applicationId, organizationId, owner],
  );
  const planId = randomUUID();
  await sql.query(
    `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
     VALUES ($1, $2, $3, 'Internal', 'internal', 'K5')`,
    [planId, organizationId, applicationId],
  );
  const appUserId = randomUUID();
  const importId = randomUUID();
  await sql.query(
    `INSERT INTO seat_baseline_imports (id, organization_id, uploaded_by, file_name, content_hash, plan_id, status,
       ignored_columns, summary, result, confirm_key, created_at, expires_at, confirmed_at)
     VALUES ($1, $2, $3, 'seats.csv', $4, $5, 'COMPLETED', '{}', '{}'::jsonb, '{}'::jsonb, 'confirm-1',
       '2026-10-12T01:00:00Z', '2026-10-13T01:00:00Z', '2026-10-12T02:00:00Z')`,
    [importId, organizationId, appUserId, 'a'.repeat(64), planId],
  );

  return {
    organizationId,
    departments: { OPS: { id: ops, unit: opsUnit }, ENG: { id: eng, unit: engUnit } },
    company: { active, inactive },
    jobTitleId,
    planId,
    importId,
    appUserId,
  };
}

async function insertEmployee(sql: Client, organizationId: string, code: string, hireDate: string): Promise<string> {
  const id = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, $3, $3, 'STAFF', $4, now())`,
    [id, organizationId, code, hireDate],
  );

  return id;
}

/** A person hired on `hireDate`, in the departments of `placements` (each period half-open, the last one open by default). */
export async function legacyEmployee(
  sql: Client,
  world: LegacyWorld,
  code: string,
  hireDate: string,
  placements: readonly LegacyPlacement[],
): Promise<string> {
  const id = await insertEmployee(sql, world.organizationId, code, hireDate);
  for (const placement of placements) {
    await sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from, valid_to)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [
        world.organizationId,
        id,
        world.departments[placement.department].id,
        world.jobTitleId,
        placement.from,
        placement.to ?? null,
      ],
    );
  }

  return id;
}

export interface LegacyServiceAccount {
  employeeId: string;
  identifier: string;
  /** The day the seat starts: the grant day of the file, or the day of the import when the file had none. */
  validFrom: string;
  basis: 'ACTUAL' | 'RECORDED';
  /** When the import wrote it (an instant). */
  createdAt: string;
  costCenter?: string;
}

/** A service account of the seat baseline, charged to the active COMPANY Cost Center as the code then required. */
export async function legacyServiceAccount(
  sql: Client,
  world: LegacyWorld,
  account: LegacyServiceAccount,
): Promise<string> {
  const id = randomUUID();
  await sql.query(
    `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
       normalized_account_identifier, reason, cost_center_id, valid_from, valid_from_basis, baseline_import_id,
       created_by_app_user_id, created_at)
     VALUES ($1, $2, 'SERVICE', 'BASELINE', $3, $4, $5, $5, 'Builds the release', $6, $7, $8, $9, $10, $11)`,
    [
      id,
      world.organizationId,
      world.planId,
      account.employeeId,
      account.identifier,
      account.costCenter ?? world.company.active,
      account.validFrom,
      account.basis,
      world.importId,
      world.appUserId,
      account.createdAt,
    ],
  );

  return id;
}

/** A flat-rate subscription whose recorded cost allocation gives `companyShareBp` to the active COMPANY Cost Center. */
export async function legacyCompanyAllocation(
  sql: Client,
  world: LegacyWorld,
  companyShareBp: number,
): Promise<{ subscriptionId: string; versionId: string }> {
  const vendorId = randomUUID();
  await sql.query(
    `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Atlassian', 'atlassian')`,
    [vendorId, world.organizationId],
  );
  const owner = await insertEmployee(sql, world.organizationId, 'E-WIKI-OWNER', '2020-01-01');
  const applicationId = randomUUID();
  await sql.query(
    `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
       data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
     VALUES ($1, $2, 'SAAS', $3, 'Confluence', 'confluence', $4, 'LOW', false, false, false, false)`,
    [applicationId, world.organizationId, vendorId, owner],
  );
  const planId = randomUUID();
  await sql.query(
    `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
     VALUES ($1, $2, $3, 'Standard', 'standard', 'K1', 'FLAT_RATE', 'PARTIAL')`,
    [planId, world.organizationId, applicationId],
  );
  const subscriptionId = randomUUID();
  await sql.query(
    `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status) VALUES ($1, $2, $3, 'TERM', 'DRAFT')`,
    [subscriptionId, world.organizationId, planId],
  );
  await sql.query(
    `INSERT INTO subscription_cost_allocations (subscription_id, organization_id, current_version) VALUES ($1, $2, 0)`,
    [subscriptionId, world.organizationId],
  );
  const versionId = randomUUID();
  await sql.query('BEGIN');
  await sql.query(
    `INSERT INTO subscription_cost_allocation_versions (id, subscription_id, version, declared_by_app_user_id)
     VALUES ($1, $2, 1, $3)`,
    [versionId, subscriptionId, world.appUserId],
  );
  await sql.query(
    `INSERT INTO subscription_cost_allocation_lines (version_id, position, cost_center_id, ratio_bp)
     VALUES ($1, 1, $2, $3), ($1, 2, $4, $5)`,
    [versionId, world.departments.OPS.unit, 10000 - companyShareBp, world.company.active, companyShareBp],
  );
  await sql.query('COMMIT');
  await sql.query(`UPDATE subscription_cost_allocations SET current_version = 1 WHERE subscription_id = $1`, [
    subscriptionId,
  ]);

  return { subscriptionId, versionId };
}
