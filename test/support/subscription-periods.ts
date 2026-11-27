import type { SeatHarness } from './seat-baseline-harness';

/**
 * A renewal recorded ahead of its start, written by SQL the way the outcome of a renewal writes it (only a renewal may point back with
 * `renewed_from_id`): the next period of `previousId`, with the same price, quantity and owner, starting on `startDate`. Returns its id.
 * No assertion lives here.
 */
export async function nextPeriod(
  h: SeatHarness,
  previousId: string,
  status: 'ACTIVE' | 'DRAFT',
  startDate: string,
): Promise<string> {
  return (
    await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, monthly_unit_price_minor,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source,
         price_reporting_minor, price_reporting_currency, billing_cycle, commitment_term_months, start_date,
         responsible_it_admin_employee_id, auto_renew, allows_mid_term_reduction, renewed_from_id, updated_at)
       SELECT gen_random_uuid(), organization_id, plan_id, kind, $2::"SubscriptionStatus", purchased_quantity,
              monthly_unit_price_minor, unit_price_minor, unit_price_currency, price_recorded_on, price_rate,
              price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency, billing_cycle,
              commitment_term_months, $3::date, responsible_it_admin_employee_id, auto_renew,
              allows_mid_term_reduction, id, now()
         FROM subscriptions WHERE id = $1
       RETURNING id`,
      [previousId, status, startDate],
    )
  ).rows[0].id;
}

/**
 * What `seats.carry` does: each seat of the period that runs continues on the next one from its first day, and ends that day. The seats are
 * then on both periods until the next one runs. No assertion lives here.
 */
export async function carry(h: SeatHarness, previousId: string, nextId: string, startDate: string): Promise<void> {
  await h.ctx.sql.query(
    `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
       normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, valid_until,
       expected_end_date, predecessor_id, created_by_app_user_id)
     SELECT gen_random_uuid(), a.organization_id, a.kind, 'RENEWAL_CARRY', a.plan_id, $2::uuid, a.employee_id, a.account_identifier,
            a.normalized_account_identifier, a.reason, a.cost_center_id, a.owning_department_id, $3::date, 'RECORDED', NULL,
            a.expected_end_date, a.id, $4::uuid
       FROM license_assignments a
      WHERE a.subscription_id = $1 AND a.valid_until IS NULL
      ORDER BY a.valid_from, a.id`,
    [previousId, nextId, startDate, h.it1.appUserId],
  );
  await h.ctx.sql.query(
    `UPDATE license_assignments SET valid_until = $2::date WHERE subscription_id = $1 AND valid_until IS NULL`,
    [previousId, startDate],
  );
}
