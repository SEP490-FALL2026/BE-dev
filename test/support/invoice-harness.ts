import { Client } from 'pg';
import request from 'supertest';
import type {
  PurchaseInvoiceRecordInput,
  PurchaseInvoiceRecorded,
} from '../../src/modules/budgets/public/budgets.types';
import type { ApiAccount } from './api-accounts';
import { bookPurchaseInvoice } from './book-purchase-invoice';
import { waitForLockWaiters } from './lock-wait';
import { SpendHarness, type Unit } from './spend-harness';

/** The spend harness with the route of the invoices of a commitment and the booking of the invoice of a purchase. */
export class InvoiceHarness extends SpendHarness {
  /** The invoice a signed purchase invoice writes, booked as the signature of Finance books it (`book-purchase-invoice.ts`). */
  recordPurchase = (
    vendorId: string,
    over: Partial<PurchaseInvoiceRecordInput> = {},
  ): Promise<PurchaseInvoiceRecorded> => bookPurchaseInvoice(this, vendorId, over);
  /**
   * A commitment of a request that is not in the table of requests, held and waiting for a budget (attached to no version), as the pass of 01/01 holds one for a Cost Center
   * that has no approved budget of the year (R-48): a version approved afterwards takes it. `requestId` names the request it is held for (a request of its own
   * when none is named); the id of the commitment is returned.
   */
  async commitWaiting(unit: Unit, year: number, amount: number, requestId?: string): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, attached_version_id, attached_at, unattached_reason, applied_minor)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'HELD'::"CommitmentState", 'YEAR_START'::"CommitmentOrigin", NULL, NULL, 'NO_BUDGET', 0)
       RETURNING id`,
      [
        this.seed.organizationId,
        requestId ?? (await this.fixtureRequestId()),
        unit.department.unitId,
        year,
        amount,
        this.reporting,
      ],
    );

    return rows[0].id;
  }

  invoicesOf = (id: string, account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/budget-commitments/${id}/invoices`).query(query).set(this.as(account));

  /**
   * Holds the row of a commitment in another connection and sends the calls one by one: each is waiting for the lock before the next
   * is sent, and they all run once it lets go, in the order they queued. The proof that two writers of one commitment never overlap.
   */
  async queuedOnCommitment<T>(commitmentId: string, sends: Array<() => PromiseLike<T>>): Promise<T[]> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    const pending: Array<Promise<T>> = [];
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM budget_commitments WHERE id = $1 FOR UPDATE', [commitmentId]);
      for (const send of sends) {
        pending.push(Promise.resolve(send()));
        await waitForLockWaiters(this.ctx.sql, pending.length);
      }
      await holder.query('COMMIT');
      const answers: T[] = [];
      for (const answer of pending) answers.push(await answer);

      return answers;
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await Promise.allSettled(pending);
    }
  }

  /**
   * Holds the row of a commitment in another connection, starts `work`, waits until it is queued on that lock, changes the commitment
   * in the holding transaction as an invoice would and lets go. What `work` reads of the commitment must be what the change made.
   */
  async lockedWhile<T>(
    commitmentId: string,
    work: () => Promise<T>,
    change: (holder: Client) => Promise<unknown>,
  ): Promise<T> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    await holder.connect();
    let pending: Promise<T> | undefined;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM budget_commitments WHERE id = $1 FOR UPDATE', [commitmentId]);
      pending = work();
      await waitForLockWaiters(this.ctx.sql, 1);
      await change(holder);
      await holder.query('COMMIT');

      return await pending;
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await Promise.allSettled(pending ? [pending] : []);
    }
  }
}
