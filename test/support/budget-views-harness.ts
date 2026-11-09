import { SpendHarness, type Unit } from './spend-harness';

/** Fixtures for reading commitments before there is an approved budget, without writing to a shared database. */
export class BudgetViewsHarness extends SpendHarness {
  async unattached(unit: Unit, year: number, amount: number): Promise<string> {
    const result = await this.ctx.sql.query<{ id: string }>(
      `
      INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor,
        currency, state, unattached_reason)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'HELD', 'NO_BUDGET') RETURNING id`,
      [this.seed.organizationId, await this.fixtureRequestId(), unit.department.unitId, year, amount, this.reporting],
    );
    return result.rows[0].id;
  }

  async invoiceAt(commitmentId: string, amount: number, recordedAt: string): Promise<void> {
    await this.ctx.sql.query(
      `
      INSERT INTO vendors (id, organization_id, name, normalized_name)
      VALUES (gen_random_uuid(), $1, 'Budget views vendor', 'budget views vendor') ON CONFLICT DO NOTHING`,
      [this.seed.organizationId],
    );
    await this.ctx.sql.query(
      `
      INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor,
        deductible_tax_minor, non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result, recorded_by_employee_id, recorded_at)
      SELECT gen_random_uuid(), $1, $2, id, $3, $4::timestamptz::date, $5, $6, 0, 0, $6, $6, 'MATCHED', $7, $4::timestamptz
        FROM vendors WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [
        this.seed.organizationId,
        commitmentId,
        `BV-${commitmentId}-${recordedAt}`,
        recordedAt,
        this.reporting,
        amount,
        this.finance.employeeId,
      ],
    );
    await this.ctx.sql.query('UPDATE budget_commitments SET applied_minor = applied_minor + $2 WHERE id = $1', [
      commitmentId,
      amount,
    ]);
  }
}
