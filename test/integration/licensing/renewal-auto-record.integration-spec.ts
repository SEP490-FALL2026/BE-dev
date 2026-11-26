import { randomUUID } from 'node:crypto';
import { addDays } from '../../../src/core/business-date';
import { SubscriptionPeriodApi } from '../../../src/modules/catalog/public/subscription-period.api';
import { SubscriptionRenewalLinesService } from '../../../src/modules/licensing/subscription-renewal/lines/subscription-renewal-lines.service';
import { Barrier } from '../../support/concurrency-harness';
import { RenewalHarness, type RenewalUnit } from '../../support/renewal-harness';

const h = new RenewalHarness();

/**
 * W3-21 concurrency integration spec: two instances simultaneously run automatic renewal resolution after the renewal day
 * behind a barrier x20. Only one `subscription_renewals` case, one successor period, one set of next-period lines,
 * and one `AUTO_RENEWAL_INCIDENT` event are created, with zero PostgreSQL deadlocks (`40P01`).
 */
describe('automatic renewal concurrency across two instances (integration, W3-21)', () => {
  let unit: RenewalUnit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.unit(2);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  async function seedTwoLineAutoPeriod(runIdx: number) {
    const today = h.today();
    const renewalOn = addDays(today, -1);
    const endDate = addDays(renewalOn, -1);
    const deadline = addDays(renewalOn, -30);
    const startDate = addDays(renewalOn, -365);

    const vendorId = randomUUID();
    const workspaceId = randomUUID();
    const functionalGroupId = randomUUID();
    const appId = randomUUID();
    const planStdId = randomUUID();
    const planPrmId = randomUUID();
    const subId = randomUUID();
    const lineStdId = randomUUID();
    const linePrmId = randomUUID();
    const tag = `${runIdx}-${randomUUID().slice(0, 6)}`;

    await h.ctx.sql.query(
      `INSERT INTO functional_groups (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, lower($3))`,
      [functionalGroupId, h.seed.organizationId, `AutoGroup-${tag}`],
    );
    await h.ctx.sql.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, lower($3))`,
      [vendorId, h.seed.organizationId, `AutoVendor-${tag}`],
    );
    await h.ctx.sql.query(
      `INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name, responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, $4, lower($4), $5, now())`,
      [workspaceId, h.seed.organizationId, vendorId, `AutoWS-${tag}`, h.it1.employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, functional_group_id, name, normalized_name, responsible_it_admin_employee_id)
       VALUES ($1, $2, 'SAAS'::"ApplicationKind", $3, $4, $5, lower($5), $6)`,
      [appId, h.seed.organizationId, vendorId, functionalGroupId, `AutoApp-${tag}`, h.it1.employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, lower($4), 'K2'::"ProvisioningType", 'PER_SEAT'::"PricingModel", 'FULL'::"ControlLevel"),
              ($5, $2, $3, $6, lower($6), 'K2'::"ProvisioningType", 'PER_SEAT'::"PricingModel", 'FULL'::"ControlLevel")`,
      [planStdId, h.seed.organizationId, appId, `Std-${tag}`, planPrmId, `Prm-${tag}`],
    );
    await h.ctx.sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity, billing_cycle, commitment_term_months,
         unit_price_minor, unit_price_currency, price_recorded_on, price_rate, price_rate_date, price_rate_source,
         price_reporting_minor, price_reporting_currency, monthly_unit_price_minor,
         start_date, end_date, renewal_date, notice_deadline, auto_renew, allows_mid_term_reduction,
         responsible_it_admin_employee_id, workspace_id, seat_counting, minimum_seats_total, updated_at)
       VALUES ($1, $2, $3, 'TERM'::"SubscriptionKind", 'ACTIVE'::"SubscriptionStatus", 14, 'ANNUAL'::"BillingCycle", 12,
         6000000, 'VND', $4::date, 1.0, $4::date, 'SAME_CURRENCY'::"PriceRateSource",
         6000000, 'VND', 500000,
         $4::date, $5::date, $6::date, $7::date, true, false, $8, $9, 'FIXED', 5, now())`,
      [subId, h.seed.organizationId, planStdId, startDate, endDate, renewalOn, deadline, h.it1.employeeId, workspaceId],
    );
    await h.ctx.sql.query(
      `INSERT INTO subscription_lines (id, organization_id, subscription_id, workspace_id, plan_id, monthly_unit_price_minor, ledger_opened_on, updated_at)
       VALUES ($1, $2, $3, $4, $5, 500000, $6::date, now()),
              ($7, $2, $3, $4, $8, 2500000, $6::date, now())`,
      [lineStdId, h.seed.organizationId, subId, workspaceId, planStdId, startDate, linePrmId, planPrmId],
    );
    await h.ctx.sql.query(
      `INSERT INTO seat_changes (id, organization_id, subscription_line_id, effective_on, delta, reason, source, basis)
       VALUES (gen_random_uuid(), $1, $2, $3::date, 12, 'INITIAL', 'ADJUSTMENT', 'NONE'),
              (gen_random_uuid(), $1, $4, $3::date, 2, 'INITIAL', 'ADJUSTMENT', 'NONE')`,
      [h.seed.organizationId, lineStdId, startDate, linePrmId],
    );
    for (const member of unit.members) {
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, $4, $5, lower($5), $6::date, 'ACTUAL', $7)`,
        [
          h.seed.organizationId,
          planStdId,
          subId,
          member.employeeId,
          `${member.employeeId}-${tag}@acme.vn`,
          startDate,
          h.it1.appUserId,
        ],
      );
    }

    return { subId, lineStdId, linePrmId, renewalOn };
  }

  it('produces 1 renewal case, 1 next-period line set, 1 incident, and 0 40P01 deadlocks across 20 barrier races', async () => {
    const periodsApi = h.ctx.app.get(SubscriptionPeriodApi, { strict: false });
    const linesService = h.ctx.app.get(SubscriptionRenewalLinesService, { strict: false });
    const people = {
      itAdmin: h.it1.employeeId,
      finance: h.finance.employeeId,
      approver: h.boss.employeeId,
      superAdmin: h.seed.superAdmin.employeeId,
    };

    for (let run = 0; run < 20; run += 1) {
      const { subId, lineStdId, linePrmId, renewalOn } = await seedTwoLineAutoPeriod(run);
      const [period] = await periodsApi.getPeriods([subId]);
      expect(period.adjustment).not.toBeNull();
      const barrier = new Barrier(2);

      const attempt = async () => {
        await barrier.wait();

        return linesService.handlePassedRenewalDay({
          organizationId: h.seed.organizationId,
          today: h.today(),
          period,
          adjustment: period.adjustment!,
          kind: 'AUTO_RENEWAL_INCIDENT',
          people,
        });
      };

      const results = await Promise.all([attempt(), attempt()]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((done) => !done)).toHaveLength(1);

      const cases = await h.ctx.sql.query<{
        id: string;
        decider_role: string;
        outcome: string;
        auto_recorded: boolean;
        next_subscription_id: string | null;
      }>(
        `SELECT id, decider_role, outcome::text, auto_recorded, next_subscription_id
           FROM subscription_renewals WHERE subscription_id = $1`,
        [subId],
      );
      expect(cases.rows).toHaveLength(1);
      expect(cases.rows[0]).toMatchObject({ decider_role: 'SYSTEM', outcome: 'UNCONFIRMED', auto_recorded: true });
      const nextSubId = cases.rows[0].next_subscription_id!;
      expect(nextSubId).toBeTruthy();

      const nextLines = await h.ctx.sql.query<{ id: string; renewed_from_line_id: string }>(
        `SELECT id, renewed_from_line_id FROM subscription_lines WHERE subscription_id = $1 ORDER BY renewed_from_line_id`,
        [nextSubId],
      );
      expect(nextLines.rows.map((r) => r.renewed_from_line_id).sort()).toEqual([lineStdId, linePrmId].sort());

      const changes = await h.ctx.sql.query<{
        delta: number;
        reason: string;
        auto_recorded: boolean;
        recorded_by_employee_id: string | null;
      }>(
        `SELECT delta, reason::text, auto_recorded, recorded_by_employee_id
           FROM seat_changes WHERE subscription_line_id = ANY($1::uuid[])`,
        [nextLines.rows.map((r) => r.id)],
      );
      expect(changes.rows).toHaveLength(2);
      expect(changes.rows.map((c) => c.delta).sort((a, b) => a - b)).toEqual([2, 12]);
      for (const row of changes.rows) {
        expect(row.reason).toBe('RENEWAL');
        expect(row.auto_recorded).toBe(true);
        expect(row.recorded_by_employee_id).toBeNull();
      }

      const oldLines = await h.ctx.sql.query<{ closed_reason: string; closed_on: string }>(
        `SELECT closed_reason::text, to_char(closed_on, 'YYYY-MM-DD') AS closed_on
           FROM subscription_lines WHERE subscription_id = $1`,
        [subId],
      );
      expect(oldLines.rows).toHaveLength(2);
      for (const row of oldLines.rows) {
        expect(row.closed_reason).toBe('RENEWED');
        expect(row.closed_on).toBe(addDays(renewalOn, -1));
      }

      const events = await h.ctx.sql.query<{ kind: string }>(
        `SELECT kind::text FROM subscription_deadline_events WHERE subscription_id = $1`,
        [subId],
      );
      expect(events.rows).toEqual([{ kind: 'AUTO_RENEWAL_INCIDENT' }]);

      const carried = await h.ctx.sql.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM license_assignments WHERE subscription_id = $1 AND source = 'RENEWAL_CARRY'`,
        [nextSubId],
      );
      expect(carried.rows[0].count).toBe(unit.members.length);
    }
  }, 180000);
});
