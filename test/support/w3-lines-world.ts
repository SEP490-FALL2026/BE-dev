import { randomBytes, randomUUID } from 'node:crypto';
import type { Client } from 'pg';

/** The day `offset` days from today, as `YYYY-MM-DD` (UTC; the specs keep a month of margin against the zone of the organization). */
export function dayFromToday(offset: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offset);

  return day.toISOString().slice(0, 10);
}

export interface PeriodOptions {
  status?: 'ACTIVE' | 'DRAFT';
  startDate?: string | null;
  endDate?: string | null;
  quantity?: number | null;
  renewedFromId?: string | null;
  autoRenew?: boolean;
  vendorMinimumSeats?: number | null;
}

/**
 * Raw-SQL world for the specs of the lines and the ledger of seats (W3-15): an organization, IT Admins and staff, vendors with their
 * workspace, plans of seats, periods of a subscription and the lines on them. Written against the tables as they stand just before
 * the migration of the lines (the migration spec) and after it (every other spec); nothing here asserts.
 */
export async function lineWorld(sql: Client) {
  await sql.query(
    `INSERT INTO currencies (code, name, minor_unit) VALUES ('VND', 'Vietnamese Dong', 0) ON CONFLICT (code) DO NOTHING`,
  );
  // A database holds one organization: the first world makes it, the next ones work in it with names of their own.
  const existing = await sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`);
  const organizationId = existing.rows[0]?.id ?? randomUUID();
  if (existing.rowCount === 0) {
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'Asia/Ho_Chi_Minh', 'VND')`,
      [organizationId],
    );
  }
  const unique = randomUUID().slice(0, 8);
  const functionalGroupId = randomUUID();
  await sql.query(
    `INSERT INTO functional_groups (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, lower($3))`,
    [functionalGroupId, organizationId, `General ${unique}`],
  );
  const person = async (code: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, `${code}-${unique}`],
    );

    return id;
  };
  const khoa = await person('KHOA');
  const nam = await person('NAM');

  const vendor = async (name: string): Promise<{ vendorId: string; workspaceId: string }> => {
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, lower($3))`, [
      vendorId,
      organizationId,
      `${name} ${unique}`,
    ]);
    const workspaceId = randomUUID();
    await sql.query(
      `INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name, responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, $4, lower($4), $5, now())`,
      [workspaceId, organizationId, vendorId, `${name} ${unique}`, khoa],
    );

    return { vendorId, workspaceId };
  };

  const plan = async (
    vendorId: string,
    name: string,
    type: 'K1' | 'K2' | 'K3' | 'K4' = 'K2',
    binding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED' | null = type === 'K4' ? 'ACCOUNT' : null,
  ): Promise<string> => {
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, functional_group_id, name, normalized_name, responsible_it_admin_employee_id)
       VALUES ($1, $2, 'SAAS'::"ApplicationKind", $3, $4, $5, lower($5), $6)`,
      [applicationId, organizationId, vendorId, functionalGroupId, `${name} app ${unique}`, khoa],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level, key_binding)
       VALUES ($1, $2, $3, $4, lower($4), $5::"ProvisioningType", $6::"PricingModel", 'FULL'::"ControlLevel", $7::"PlanKeyBinding")`,
      [planId, organizationId, applicationId, name, type, type === 'K1' || type === 'K2' ? 'PER_SEAT' : null, binding],
    );

    return planId;
  };

  /** A perpetual purchase (a subscription bought once) of a plan: active with its price, or a draft. */
  const perpetual = async (
    planId: string,
    options: { status?: 'ACTIVE' | 'DRAFT'; quantity?: number | null; unitPriceMinor?: number | null } = {},
  ): Promise<string> => {
    const id = randomUUID();
    const price = options.unitPriceMinor === undefined ? 1500000 : options.unitPriceMinor;
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, start_date, responsible_it_admin_employee_id,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
         price_reporting_currency, updated_at)
       VALUES ($1, $2, $3, 'PERPETUAL'::"SubscriptionKind", $4::"SubscriptionStatus", $5, '2026-09-01', $6,
         $7::bigint, CASE WHEN $7::bigint IS NULL THEN NULL ELSE 'VND' END, CASE WHEN $7::bigint IS NULL THEN NULL ELSE '2026-09-01'::date END,
         CASE WHEN $7::bigint IS NULL THEN NULL ELSE 1.0 END, CASE WHEN $7::bigint IS NULL THEN NULL ELSE '2026-09-01'::date END,
         CASE WHEN $7::bigint IS NULL THEN NULL ELSE 'SAME_CURRENCY'::"PriceRateSource" END, $7::bigint,
         CASE WHEN $7::bigint IS NULL THEN NULL ELSE 'VND' END, now())`,
      [
        id,
        organizationId,
        planId,
        options.status ?? 'ACTIVE',
        options.quantity === undefined ? 3 : options.quantity,
        khoa,
        price,
      ],
    );

    return id;
  };

  /**
   * A key in the vault of a subscription, as the import of wave 2 writes it (a lot born from the subscription takes it by the id). Before the
   * migration of the lots the table has no cost column: pass `false` for `afterLots` then.
   */
  const key = async (subscriptionId: string, afterLots = true): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, ${afterLots ? 'cost_borne, ' : ''}fingerprint, masked, ciphertext, cipher_key_id,
         imported_by_app_user_id) VALUES ($1, $2, $3, ${afterLots ? 'true, ' : ''}$4, '....1234', decode(repeat('ab', 40), 'hex'), 'k1', $5)`,
      [id, organizationId, subscriptionId, randomBytes(32).toString('hex'), randomUUID()],
    );

    return id;
  };

  /** A period (a subscription) of a plan in a workspace; by default an active monthly one that began two months ago and ends in ten months. */
  const period = async (planId: string, workspaceId: string | null, options: PeriodOptions = {}): Promise<string> => {
    const id = randomUUID();
    const status = options.status ?? 'ACTIVE';
    const startDate = options.startDate === undefined ? dayFromToday(-60) : options.startDate;
    const endDate = options.endDate === undefined ? dayFromToday(300) : options.endDate;
    const quantity = options.quantity === undefined ? 5 : options.quantity;
    if (status === 'DRAFT') {
      await sql.query(
        `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, workspace_id, responsible_it_admin_employee_id,
           vendor_minimum_seats, updated_at)
         VALUES ($1, $2, $3, 'TERM'::"SubscriptionKind", 'DRAFT'::"SubscriptionStatus", $4, $5, $6, $7, now())`,
        [id, organizationId, planId, quantity, workspaceId, khoa, options.vendorMinimumSeats ?? null],
      );

      return id;
    }
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, billing_cycle, commitment_term_months,
         start_date, end_date, renewed_from_id, auto_renew, workspace_id, responsible_it_admin_employee_id, vendor_minimum_seats,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor,
         price_reporting_currency, monthly_unit_price_minor, updated_at)
       VALUES ($1, $2, $3, 'TERM'::"SubscriptionKind", 'ACTIVE'::"SubscriptionStatus", $4, 'MONTHLY'::"BillingCycle", 1,
         $5, $6, $7, $8, $9, $10, $11,
         375000, 'VND', '2026-10-01', '1.0000000000', '2026-10-01', 'SAME_CURRENCY'::"PriceRateSource", 375000, 'VND', 375000, now())`,
      [
        id,
        organizationId,
        planId,
        quantity,
        startDate,
        endDate,
        options.renewedFromId ?? null,
        options.autoRenew ?? false,
        workspaceId,
        khoa,
        options.vendorMinimumSeats ?? null,
      ],
    );

    return id;
  };

  /** A line on a period (only once the migration of the lines has run). */
  const line = async (
    subscriptionId: string,
    workspaceId: string,
    planId: string,
    extra: {
      ledgerOpenedOn?: string | null;
      closedOn?: string | null;
      closedReason?: string | null;
      renewedFromLineId?: string | null;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO subscription_lines (id, organization_id, subscription_id, workspace_id, plan_id, monthly_unit_price_minor,
         ledger_opened_on, closed_on, closed_reason, renewed_from_line_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, 375000, $6, $7, $8, $9, now())`,
      [
        id,
        organizationId,
        subscriptionId,
        workspaceId,
        planId,
        extra.ledgerOpenedOn ?? null,
        extra.closedOn ?? null,
        extra.closedReason ?? null,
        extra.renewedFromLineId ?? null,
      ],
    );

    return id;
  };

  /** A personal seat of a plan on a period, from `from` until `until` (open when null). */
  const seat = async (
    subscriptionId: string,
    planId: string,
    employeeId: string,
    from: string,
    until: string | null = null,
  ) => {
    await sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, valid_until, created_by_app_user_id)
       SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $1, e.id, e.employee_code || '@acme.vn',
              lower(e.employee_code) || '@acme.vn', $4::date, 'ACTUAL', $5::date, gen_random_uuid()
         FROM employees e WHERE e.id = $3`,
      [subscriptionId, planId, employeeId, from, until],
    );
  };

  /** A row of the ledger: an opening or a renewal comes through the door of the system, a top-up or a reduction through the vendor's record. */
  const adjust = async (
    lineId: string,
    effectiveOn: string,
    delta: number,
    reason: 'INITIAL' | 'RENEWAL' | 'TOP_UP' | 'REDUCE' = delta > 0 ? 'INITIAL' : 'REDUCE',
  ) => {
    const adjustment = reason === 'INITIAL' || reason === 'RENEWAL';
    await sql.query(
      `INSERT INTO seat_changes (id, organization_id, subscription_line_id, effective_on, delta, reason, source, basis, note)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'NONE', $7)`,
      [
        organizationId,
        lineId,
        effectiveOn,
        delta,
        reason,
        adjustment ? 'ADJUSTMENT' : 'VENDOR_RECORD',
        adjustment ? null : 'as the vendor says',
      ],
    );
  };

  return { organizationId, khoa, nam, person, vendor, plan, period, perpetual, key, line, seat, adjust };
}
