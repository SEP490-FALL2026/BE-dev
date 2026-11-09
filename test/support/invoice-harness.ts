import { Client } from 'pg';
import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { waitForLockWaiters } from './lock-wait';
import { SpendHarness } from './spend-harness';

/** The spend harness with the routes of the invoices of a commitment. */
export class InvoiceHarness extends SpendHarness {
  recordInvoice = (id: string, body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/budget-commitments/${id}/invoices`).set(this.as(account)).send(body);
  invoicesOf = (id: string, account: ApiAccount = this.finance, query: Record<string, string | number> = {}) =>
    request(this.server()).get(`/api/v1/budget-commitments/${id}/invoices`).query(query).set(this.as(account));

  /**
   * Holds the row of a commitment in another connection and sends the calls one by one: each is waiting for the lock before the next
   * is sent, and they all run once it lets go, in the order they queued. The proof that two writers of one commitment never overlap.
   */
  async queuedOnCommitment(commitmentId: string, sends: Array<() => request.Test>): Promise<request.Response[]> {
    const holder = new Client({ connectionString: this.ctx.database.url });
    const pending: Array<Promise<request.Response>> = [];
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM budget_commitments WHERE id = $1 FOR UPDATE', [commitmentId]);
      for (const send of sends) {
        pending.push(send().then((response) => response));
        await waitForLockWaiters(this.ctx.sql, pending.length);
      }
      await holder.query('COMMIT');
      const answers: request.Response[] = [];
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
