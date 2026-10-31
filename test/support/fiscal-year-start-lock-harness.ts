import { Client } from 'pg';
import { BudgetHarness, type ProposalWire } from './budget-harness';

export const FISCAL_KEY = 'FISCAL_YEAR_START_MONTH';

/** The budget harness plus what the lock of the fiscal year start month is judged on: the stored value, its audit and a head's proposal. */
export class FiscalYearStartLockHarness extends BudgetHarness {
  private proposalCount = 0;

  /** A proposal sent by the head of a new department, which is what a first version is built from. */
  async waitingProposal(): Promise<ProposalWire> {
    this.proposalCount += 1;
    const unit = await this.departmentWithHead(`P-FY${this.proposalCount}`);

    return this.budgetProposed(unit.head, unit.department.unitId);
  }

  /** The row of the key that holds the value now, or null while the default stands. */
  async currentRow(key = FISCAL_KEY): Promise<{ value: unknown; validFrom: Date } | null> {
    const { rows } = await this.ctx.sql.query<{ value: unknown; valid_from: Date }>(
      `SELECT value, valid_from FROM parameter_values WHERE key = $1 AND valid_to IS NULL`,
      [key],
    );

    return rows[0] ? { value: rows[0].value, validFrom: rows[0].valid_from } : null;
  }

  async valueRows(key = FISCAL_KEY): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ count: string }>(
      `SELECT count(*) FROM parameter_values WHERE key = $1`,
      [key],
    );

    return Number(rows[0].count);
  }

  async changeAudits(key = FISCAL_KEY): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ count: string }>(
      `SELECT count(*) FROM audit_events WHERE action = 'PARAMETER.CHANGED' AND resource_id = $1`,
      [key],
    );

    return Number(rows[0].count);
  }

  /** A connection that holds a transaction open, to freeze one of the two writers at a lock while the other arrives. */
  async holder(): Promise<Client> {
    const client = new Client({ connectionString: this.ctx.database.url });
    await client.connect();
    await client.query('BEGIN');

    return client;
  }
}
