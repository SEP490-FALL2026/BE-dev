import request from 'supertest';
import { BudgetFactsRepo } from '../../src/modules/budgets/budget/budget-facts.repo';
import type { ApiAccount } from './api-accounts';
import type { SpendHarness, Unit } from './spend-harness';

/** An adjustment as the routes answer it. */
export interface AdjustmentWire {
  id: string;
  kind: string;
  state: string;
  amount: { amount: string };
  from: { id: string } | null;
  to: { id: string } | null;
  createdBy: { employeeId: string } | null;
  decidedBy: { employeeId: string } | null;
  decisionReason: string | null;
  transferReason: string | null;
  createdVersionId: string | null;
}

const M = 1_000_000;

/**
 * The calls a suite about the adjustments of the budget makes (`FIX-AD1`): Finance asks, the spending approver decides, and the figures it reads back: the effective budget of a
 * Cost Center (`yearFacts`), what the Cost Centers hold together and the annual ceiling, which a suite sets to leave a given part not allocated. No assertion lives here.
 */
export function adjustmentCalls(h: SpendHarness) {
  const ask = (body: Record<string, unknown>) =>
    request(h.server())
      .post('/api/v1/budget-adjustments')
      .set(h.as(h.finance))
      .send({ year: h.year, reason: 'Điều chỉnh trong năm', ...body });
  const supplement = (to: Unit, tr: number) =>
    ask({ kind: 'SUPPLEMENT', toCostCenterId: to.department.unitId, amount: h.money(tr * M) });
  const transfer = (from: Unit, to: Unit, tr: number, extra: Record<string, unknown> = {}) =>
    ask({
      kind: 'TRANSFER',
      fromCostCenterId: from.department.unitId,
      toCostCenterId: to.department.unitId,
      amount: h.money(tr * M),
      ...extra,
    });
  const giveBack = (from: Unit, tr: number) =>
    ask({ kind: 'RETURN', fromCostCenterId: from.department.unitId, amount: h.money(tr * M) });
  const decide = (id: string, body: Record<string, unknown>, account: ApiAccount = h.deciderOf()) =>
    request(h.server()).post(`/api/v1/budget-adjustments/${id}/decision`).set(h.as(account)).send(body);
  const made = async (response: request.Test): Promise<AdjustmentWire> =>
    h.dataOf<AdjustmentWire>(await response.expect(201));
  const code = (response: { body: unknown }) => (response.body as { error: { code: string } }).error.code;
  const details = (response: { body: unknown }) =>
    (response.body as { error: { details: Record<string, string> } }).error.details;
  const facts = async (unit: Unit, year = h.year) =>
    (await h.ctx.app.get(BudgetFactsRepo, { strict: false }).yearFacts(unit.department.unitId, [year])).get(year);
  /** What the Cost Centers hold together, base and reserve with the adjustments. */
  const allocated = (year = h.year): Promise<bigint> =>
    h.ctx.app.get(BudgetFactsRepo, { strict: false }).allocatedOfYear(h.seed.organizationId, year);
  const ceilingOf = async (year = h.year): Promise<bigint> =>
    BigInt(
      (
        await h.ctx.sql.query<{ c: string }>(
          `SELECT annual_ceiling_minor::text AS c FROM budget_cycles WHERE year = $1`,
          [year],
        )
      ).rows[0].c,
    );
  /** The annual ceiling is what the Cost Centers hold and `leftTr` more; the reserve of the shared pool is nothing. */
  const ceilingLeaving = async (leftTr: number, year = h.year): Promise<void> => {
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = $2 WHERE year = $1`, [
      year,
      ((await allocated(year)) + BigInt(leftTr * M)).toString(),
    ]);
  };

  return {
    ask,
    supplement,
    transfer,
    giveBack,
    decide,
    made,
    code,
    details,
    facts,
    allocated,
    ceilingOf,
    ceilingLeaving,
  };
}
