import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const CHECK = '23514';
const RESTRICT = '23001';

interface CommitmentRow {
  id: string;
  state: string;
  amount_minor: string;
  released_minor: string;
  released_at: Date | null;
}
interface TableRow {
  costCenter: { id: string };
  committed: { amount: string };
  remaining: { amount: string };
}
interface CommitmentWire {
  id: string;
  state: string;
  amount: { amount: string };
  released: { amount: string };
  held: { amount: string };
}
interface ReleaseWire {
  amount: { amount: string };
  reason: string;
  reasonText: string | null;
  releasedBy: { employeeId: string } | null;
}

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('the money held for a request goes back to the budget over PostgreSQL (US-06-06)', () => {
  let plan: string;
  let subscriptionId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    plan = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** 100 million, 20 held, 40 spent: 40 left. */
  const example = async () => {
    counter += 1;
    const u: Unit = await h.departmentWithHead(`P-L${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  const approved = async (u: Unit, amount: number) => {
    const id = await h.waitingForApprover(u, plan, { amount });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT id, state, amount_minor::text, released_minor::text, released_at FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const row = async (u: Unit) =>
    h
      .dataOf<{ items: TableRow[] }>(await h.table(h.finance, { year: h.year, pageSize: 100 }).expect(200))
      .items.find((item) => item.costCenter.id === u.department.unitId);
  const release = async (
    requestId: string,
    input: { reason?: string; amounts?: { year: number; amountMinor: bigint }[] } = {},
  ) => {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });

    return runner.run((tx) =>
      budgets.releaseForRequest(tx, {
        requestId,
        reason: (input.reason ?? 'REQUEST_WITHDRAWN') as 'REQUEST_WITHDRAWN',
        amounts: input.amounts,
        now: new Date(),
      }),
    );
  };
  const ledger = async (commitmentId: string) =>
    (
      await h.ctx.sql.query<{ amount_minor: string; reason: string; released_by_employee_id: string | null }>(
        `SELECT amount_minor::text, reason, released_by_employee_id FROM budget_commitment_releases WHERE commitment_id = $1 ORDER BY released_at, id`,
        [commitmentId],
      )
    ).rows;
  const setState = (requestId: string, state: string) =>
    h.ctx.sql.query(`UPDATE access_requests SET state = $2::"AccessRequestState" WHERE id = $1`, [requestId, state]);

  describe('a grant that fails (AC-3, AC-7)', () => {
    it('keeps the commitment while the grant is only failing, and gives all of it back when the IT Admin closes it as failed', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const granted = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: id, subscriptionId }).expect(201));
      await h.claim(granted.task.id).expect(200);
      const before = (await row(u))?.remaining.amount;

      await h.fail(granted.task.id, { reason: 'The portal refused the account' }).expect(200);

      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
      expect((await row(u))?.remaining.amount).toBe(before);

      await h.closeFailed(granted.task.id, { reason: 'The portal cannot hold the account' }).expect(200);

      const after = await commitmentOf(id);
      expect(after).toMatchObject({ state: 'RELEASED', amount_minor: String(15 * M), released_minor: String(15 * M) });
      expect(after.released_at).not.toBeNull();
      expect(await h.state(id)).toBe('FAILED');
      expect((await row(u))?.remaining.amount).toBe(String(40 * M));
      expect(await ledger(after.id)).toEqual([
        { amount_minor: String(15 * M), reason: 'GRANT_FAILED', released_by_employee_id: null },
      ]);
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'BUDGET_COMMITMENT.RELEASED' AND resource_id = $1 AND actor_kind = 'SYSTEM'`,
        [after.id],
      );
      expect(events.rowCount).toBe(1);
    });
  });

  describe('a request that goes away (AC-2, US-05-08 AC-5)', () => {
    it('gives back all of it, and makes no assignment', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      expect((await row(u))?.remaining.amount).toBe(String(25 * M));

      const released = await release(id);

      expect(released).toEqual([
        expect.objectContaining({ year: h.year, releasedMinor: BigInt(15 * M), heldMinor: 0n, released: true }),
      ]);
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED' });
      expect((await row(u))?.remaining.amount).toBe(String(40 * M));
      const assignments = await h.ctx.sql.query(`SELECT 1 FROM provisioning_tasks WHERE request_id = $1`, [id]);
      expect(assignments.rowCount).toBe(0);
      expect(await release(id)).toEqual([]);
    });

    it('gives back only what is not spent when the rest already has a basis, and the rest stays held', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);

      const released = await release(id, { amounts: [{ year: h.year, amountMinor: BigInt(10 * M) }] });

      expect(released).toEqual([
        expect.objectContaining({ releasedMinor: BigInt(10 * M), heldMinor: BigInt(5 * M), released: false }),
      ]);
      expect(await commitmentOf(id)).toMatchObject({
        state: 'HELD',
        released_minor: String(10 * M),
        released_at: null,
      });
      expect((await row(u))?.remaining.amount).toBe(String(35 * M));
      await expect(release(id, { amounts: [{ year: h.year, amountMinor: BigInt(6 * M) }] })).rejects.toMatchObject({
        reason: 'EXCEEDS_HELD',
      });
      expect(await commitmentOf(id)).toMatchObject({ released_minor: String(10 * M) });
    });

    it('is refused for a year it holds nothing for, or for nothing', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);

      await expect(release(id, { amounts: [{ year: h.year + 5, amountMinor: 1n }] })).rejects.toMatchObject({
        reason: 'NO_COMMITMENT',
      });
      await expect(release(id, { amounts: [{ year: h.year, amountMinor: 0n }] })).rejects.toMatchObject({
        reason: 'AMOUNT_NOT_POSITIVE',
      });
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });
  });

  describe('a share withdrawn (US-05-17 AC-10)', () => {
    it('gives back the share and leaves the commitment of the others held', async () => {
      const u = await example();
      const id = await approved(u, 12 * M);
      const other = await approved(u, 8 * M);

      await release(id, { reason: 'PARTICIPANT_WITHDRAWN', amounts: [{ year: h.year, amountMinor: BigInt(3 * M) }] });

      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: String(3 * M) });
      expect(await commitmentOf(other)).toMatchObject({ state: 'HELD', released_minor: '0' });
      expect((await row(u))?.remaining.amount).toBe(String(40 * M - 12 * M - 8 * M + 3 * M));
      expect(await ledger((await commitmentOf(id)).id)).toEqual([
        { amount_minor: String(3 * M), reason: 'PARTICIPANT_WITHDRAWN', released_by_employee_id: null },
      ]);
    });
  });

  describe('what never goes back (AC-4)', () => {
    it('does not give back or hold again what became an expense, by the service or by the database', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);
      await h.ctx.sql.query(`UPDATE budget_commitments SET state = 'EXPENSED' WHERE id = $1`, [commitment.id]);

      expect(await release(id)).toEqual([]);
      await expect(release(id, { amounts: [{ year: h.year, amountMinor: 1n }] })).rejects.toMatchObject({
        reason: 'NOT_HELD',
      });
      expect(await ledger(commitment.id)).toEqual([]);
      expect(await sqlState(`UPDATE budget_commitments SET state = 'HELD' WHERE id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`UPDATE budget_commitments SET state = 'RELEASED' WHERE id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
      expect(await commitmentOf(id)).toMatchObject({ state: 'EXPENSED', released_minor: '0' });
    });

    it('does not come back from released, does not shrink what went back, and keeps what it was made for', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);
      await release(id, { amounts: [{ year: h.year, amountMinor: BigInt(5 * M) }] });

      expect(await sqlState(`UPDATE budget_commitments SET released_minor = 1 WHERE id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
      expect(
        await sqlState(`UPDATE budget_commitments SET amount_minor = amount_minor + 1 WHERE id = $1`, [commitment.id]),
      ).toBe(RESTRICT);
      expect(await sqlState(`UPDATE budget_commitments SET year = year + 1 WHERE id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
      expect(
        await sqlState(`UPDATE budget_commitments SET released_minor = amount_minor + 1 WHERE id = $1`, [
          commitment.id,
        ]),
      ).toBe(CHECK);
      await release(id);
      expect(await commitmentOf(id)).toMatchObject({ state: 'RELEASED' });
      expect(
        await sqlState(`UPDATE budget_commitments SET state = 'HELD', released_at = NULL WHERE id = $1`, [
          commitment.id,
        ]),
      ).toBe(RESTRICT);
      expect(await sqlState(`UPDATE budget_commitments SET released_minor = 0 WHERE id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
    });
  });

  describe('Finance lets the remainder go (AC-6)', () => {
    const remainder = (commitmentId: string, body: object, account = h.finance) =>
      h.releaseCommitment(commitmentId, body, account);

    it('gives back what is left once the request has ended, with the reason and the name of Finance', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);
      await release(id, { reason: 'PARTICIPANT_WITHDRAWN', amounts: [{ year: h.year, amountMinor: BigInt(12 * M) }] });
      await setState(id, 'COMPLETED');

      const response = await remainder(commitment.id, { reason: 'No invoice will come for the rest' }).expect(200);

      expect(h.dataOf<{ commitment: CommitmentWire }>(response).commitment).toMatchObject({
        state: 'RELEASED',
        amount: { amount: String(15 * M) },
        released: { amount: String(15 * M) },
        held: { amount: '0' },
      });
      expect((await row(u))?.remaining.amount).toBe(String(40 * M));
      const releases = h.dataOf<{ items: ReleaseWire[] }>(
        await h.commitmentReleases(commitment.id, h.finance).expect(200),
      );
      expect(releases.items).toEqual([
        expect.objectContaining({ reason: 'PARTICIPANT_WITHDRAWN', releasedBy: null }),
        expect.objectContaining({
          reason: 'REMAINDER',
          reasonText: 'No invoice will come for the rest',
          amount: { amount: String(3 * M), currency: expect.any(String) as string },
          releasedBy: expect.objectContaining({ employeeId: h.finance.employeeId }) as { employeeId: string },
        }),
      ]);
    });

    it('does not save without a reason, and is only for Finance', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);
      await setState(id, 'COMPLETED');

      for (const body of [
        {},
        { reason: '' },
        { reason: '   ' },
        { reason: 'x'.repeat(1001) },
        { reason: 'ok', amount: 1 },
      ]) {
        await remainder(commitment.id, body).expect(422);
      }
      for (const account of [h.boss.account, u.head.account, h.it1, u.member.account]) {
        await remainder(commitment.id, { reason: 'Not mine to release' }, account).expect(403);
        await h.commitmentReleases(commitment.id, account).expect(403);
      }
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
    });

    it('waits for the request to end, and is not for what is released or became an expense', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);

      const open = await remainder(commitment.id, { reason: 'Too early' }).expect(409);
      expect(h.codeOf(open)).toBe('BUDGET.COMMITMENT_REQUEST_OPEN');

      await setState(id, 'COMPLETED');
      await remainder(commitment.id, { reason: 'Nothing is left to come' }).expect(200);
      const again = await remainder(commitment.id, { reason: 'Once more' }).expect(409);
      expect(h.codeOf(again)).toBe('BUDGET.COMMITMENT_NOT_HELD');

      const spent = await approved(u, 5 * M);
      const expensed = await commitmentOf(spent);
      await h.ctx.sql.query(`UPDATE budget_commitments SET state = 'EXPENSED' WHERE id = $1`, [expensed.id]);
      await setState(spent, 'COMPLETED');
      expect(h.codeOf(await remainder(expensed.id, { reason: 'Already spent' }).expect(409))).toBe(
        'BUDGET.COMMITMENT_NOT_HELD',
      );
      await remainder('00000000-0000-4000-8000-000000000000', { reason: 'None' }).expect(404);
    });

    it('shows what is held and what went back in the list of Finance', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      await release(id, { reason: 'PARTICIPANT_WITHDRAWN', amounts: [{ year: h.year, amountMinor: BigInt(4 * M) }] });

      const listed = h.dataOf<{ items: CommitmentWire[] }>(
        await h.commitmentList(h.finance, { requestId: id }).expect(200),
      );

      expect(listed.items).toEqual([
        expect.objectContaining({
          state: 'HELD',
          amount: expect.objectContaining({ amount: String(15 * M) }) as { amount: string },
          released: expect.objectContaining({ amount: String(4 * M) }) as { amount: string },
          held: expect.objectContaining({ amount: String(11 * M) }) as { amount: string },
        }),
      ]);
    });
  });

  describe('what the database keeps of what went back (INV-05)', () => {
    it('is not changed or deleted, and a remainder says why and who', async () => {
      const u = await example();
      const id = await approved(u, 15 * M);
      const commitment = await commitmentOf(id);
      await release(id, { amounts: [{ year: h.year, amountMinor: BigInt(M) }] });
      const [written] = await ledger(commitment.id);
      expect(written).toBeDefined();

      expect(
        await sqlState(`UPDATE budget_commitment_releases SET amount_minor = 1 WHERE commitment_id = $1`, [
          commitment.id,
        ]),
      ).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM budget_commitment_releases WHERE commitment_id = $1`, [commitment.id])).toBe(
        RESTRICT,
      );
      expect(await sqlState(`TRUNCATE budget_commitment_releases`)).toBe(RESTRICT);
      const insert = (reason: string, text: string | null, by: string | null, amount = 1) =>
        sqlState(
          `INSERT INTO budget_commitment_releases (id, commitment_id, amount_minor, reason, reason_text, released_by_employee_id, released_at)
           VALUES (gen_random_uuid(), $1, $5, $2::"CommitmentReleaseReason", $3, $4, now())`,
          [commitment.id, reason, text, by, amount],
        );
      expect(await insert('REMAINDER', null, h.finance.employeeId)).toBe(CHECK);
      expect(await insert('REMAINDER', '  ', h.finance.employeeId)).toBe(CHECK);
      expect(await insert('REMAINDER', 'Why', null)).toBe(CHECK);
      expect(await insert('GRANT_FAILED', null, null, 0)).toBe(CHECK);
    });
  });
});
