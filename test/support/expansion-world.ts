import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/**
 * The rows around a subscription for the compatibility-release suites (`g0-g6-final-business-baseline-remediation`,
 * Task 1.2a → 4.7a): an organization, two departments each charged to its own Unit, an owner employee, and one plan.
 * Every statement here is plain SQL that runs unchanged on the schema **before** and **after** the compatibility
 * migrations, because it writes only what the `7c28e75` application wrote: this is how a suite plays the previous
 * release (the migrate → recreate window of H7, or its recovery to the previous image). Nothing here asserts.
 */
export interface ExpansionWorld {
  organizationId: string;
  ownerEmployeeId: string;
  planId: string;
  departments: { eng: string; ops: string };
  costCenters: { eng: string; ops: string };
}

export async function expansionWorld(sql: Client): Promise<ExpansionWorld> {
  const organizationId = randomUUID();
  await sql.query(
    `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
    [organizationId],
  );
  const ownerEmployeeId = randomUUID();
  await sql.query(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
     VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
    [ownerEmployeeId, organizationId],
  );
  const costCenters = { eng: randomUUID(), ops: randomUUID() };
  await sql.query(
    `INSERT INTO cost_centers (id, organization_id, code, name, kind, status) VALUES
       ($1, $3, 'CC-ENG', 'Engineering', 'UNIT', 'ACTIVE'), ($2, $3, 'CC-OPS', 'Operations', 'UNIT', 'ACTIVE')`,
    [costCenters.eng, costCenters.ops, organizationId],
  );
  const departments = { eng: randomUUID(), ops: randomUUID() };
  await sql.query(
    `INSERT INTO departments (id, organization_id, code, name, cost_center_id, updated_at) VALUES
       ($1, $3, 'ENG', 'Engineering', $4, now()), ($2, $3, 'OPS', 'Operations', $5, now())`,
    [departments.eng, departments.ops, organizationId, costCenters.eng, costCenters.ops],
  );
  const vendorId = randomUUID();
  await sql.query(
    `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Figma', 'figma')`,
    [vendorId, organizationId],
  );
  const applicationId = randomUUID();
  await sql.query(
    `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
       data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
     VALUES ($1, $2, 'SAAS', $3, 'Figma', 'figma', $4, 'LOW', false, false, false, false)`,
    [applicationId, organizationId, vendorId, ownerEmployeeId],
  );
  const planId = randomUUID();
  await sql.query(
    `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
     VALUES ($1, $2, $3, 'Figma plan', 'figma plan', 'K2', 'PER_SEAT', 'FULL')`,
    [planId, organizationId, applicationId],
  );

  return { organizationId, ownerEmployeeId, planId, departments, costCenters };
}

/** A draft subscription as the `7c28e75` repository inserts it: no owner department, because that release has none. */
export async function insertSubscriptionAs7c28e75(sql: Client, world: ExpansionWorld): Promise<string> {
  const id = randomUUID();
  await sql.query(
    `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, auto_renew, allows_mid_term_reduction)
     VALUES ($1, $2, $3, 'TERM', 'DRAFT', false, false)`,
    [id, world.organizationId, world.planId],
  );

  return id;
}

/** The whole mutable state the `7c28e75` repository rewrites on a change (`columnsOf`), here reduced to two columns. */
export async function updateSubscriptionAs7c28e75(sql: Client, id: string): Promise<void> {
  await sql.query(
    `UPDATE subscriptions SET purchased_quantity = 5, auto_renew = true, updated_at = now() WHERE id = $1`,
    [id],
  );
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no (null: it was accepted). */
export async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}
