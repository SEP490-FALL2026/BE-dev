import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { PurchaseInvoiceRecordRefusedError } from '../../../src/modules/budgets/public/budgets.errors';
import type {
  PurchaseInvoiceRecordInput,
  PurchaseInvoiceRecorded,
} from '../../../src/modules/budgets/public/budgets.types';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

describe('the invoice Finance signs for a purchase is booked to the month it pays for (PI-1.5; T-PI, R-51, MIN-15)', () => {
  let plan: string;
  let vendorId: string;
  let counter = 0;
  let invoiceNumber = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    vendorId = (await h.vendorOf(plan)).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const actor = (): AuthenticatedPrincipal => ({
    subject: h.finance.appUserId,
    appUserId: h.finance.appUserId,
    sessionId: randomUUID(),
    employeeId: h.finance.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  });

  /** A department with a budget of 100 million. */
  const department = async (): Promise<Unit> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-PI${counter}`);
    await h.budgetFor(unit, { total: 100 * M });

    return unit;
  };
  /** A department whose commitment of 20 million the spending approver made for a request. */
  const committed = async () => {
    const unit = await department();
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { unit, requestId };
  };
  const record = (over: Partial<PurchaseInvoiceRecordInput>): Promise<PurchaseInvoiceRecorded> => {
    invoiceNumber += 1;

    return h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
      h.ctx.app.get(BudgetsApi, { strict: false }).recordPurchaseInvoice(tx, actor(), {
        organizationId: h.seed.organizationId,
        purchaseInvoiceId: randomUUID(),
        requestId: null,
        subscriptionId: null,
        vendorId,
        number: `PI-${invoiceNumber}`,
        issuedOn: `${h.year}-11-03`,
        serviceMonth: `${h.year}-11-01`,
        netMinor: BigInt(6 * M),
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor: 0n,
        matchResult: 'MATCHED',
        chargedCostCenterId: null,
        now: new Date(),
        ...over,
      }),
    );
  };
  const facts = async (unit: Unit, year = h.year) =>
    (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [year])).get(year);
  const row = async (invoiceId: string) =>
    (
      await h.ctx.sql.query<{
        commitment_id: string | null;
        cost_center_id: string | null;
        subscription_id: string | null;
        service_month: string;
        applied_minor: string;
        actual_cost_minor: string;
        match_result: string;
      }>(
        `SELECT commitment_id, cost_center_id, subscription_id, to_char(service_month, 'YYYY-MM-DD') AS service_month,
                applied_minor::text, actual_cost_minor::text, match_result
           FROM invoices WHERE id = $1`,
        [invoiceId],
      )
    ).rows[0];
  const commitmentApplied = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ applied_minor: string; state: string }>(
        `SELECT applied_minor::text, state FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];

  it("goes into the commitment of the year when the Cost Center that bears it is the commitment's own, and is spent in that year", async () => {
    const { unit, requestId } = await committed();

    const recorded = await record({
      requestId,
      chargedCostCenterId: unit.department.unitId,
      netMinor: BigInt(6 * M),
      nonDeductibleTaxMinor: BigInt(300_000),
    });

    expect(recorded).toMatchObject({
      booking: 'COMMITMENT',
      actualCostMinor: BigInt(6_300_000),
      appliedMinor: BigInt(6 * M),
    });
    expect(await row(recorded.invoiceId)).toMatchObject({
      cost_center_id: null,
      service_month: `${h.year}-11-01`,
      applied_minor: String(6 * M),
      match_result: 'TAX_ONLY',
    });
    expect((await row(recorded.invoiceId)).commitment_id).not.toBeNull();
    expect(await commitmentApplied(requestId)).toMatchObject({ applied_minor: String(6 * M), state: 'HELD' });
    expect(await facts(unit)).toMatchObject({ spentMinor: BigInt(6_300_000) });
  });

  it('is an expense of the department that holds the right now, with no commitment, when it moved (transfer 16/11, period 11)', async () => {
    const { unit: oldUnit, requestId } = await committed();
    const newUnit = await department();

    const recorded = await record({ requestId, chargedCostCenterId: newUnit.department.unitId });

    expect(recorded).toMatchObject({
      booking: 'COST_CENTER',
      costCenterId: newUnit.department.unitId,
      appliedMinor: 0n,
    });
    expect(await row(recorded.invoiceId)).toMatchObject({
      commitment_id: null,
      cost_center_id: newUnit.department.unitId,
      applied_minor: '0',
    });
    expect(await commitmentApplied(requestId)).toMatchObject({ applied_minor: '0', state: 'HELD' });
    expect(await facts(newUnit)).toMatchObject({ spentMinor: BigInt(6 * M) });
    expect(await facts(oldUnit)).toMatchObject({ spentMinor: 0n });
  });

  it('belongs to the year of the month it pays for, whatever day it is dated: dated 02/01 for December is spent in the year before', async () => {
    const { unit, requestId } = await committed();
    const next = h.year + 1;
    await h.budgetFor(unit, { total: 100 * M, year: next });

    const recorded = await record({
      requestId,
      chargedCostCenterId: unit.department.unitId,
      issuedOn: `${next}-01-02`,
      serviceMonth: `${h.year}-12-01`,
    });

    expect(recorded.booking).toBe('COMMITMENT');
    expect(await facts(unit)).toMatchObject({ spentMinor: BigInt(6 * M) });
    expect(await facts(unit, next)).toMatchObject({ spentMinor: 0n });
  });

  it('is an expense of the Cost Center for a year the request holds nothing for, counted in that year', async () => {
    const { unit, requestId } = await committed();
    const next = h.year + 1;
    await h.budgetFor(unit, { total: 100 * M, year: next });

    const recorded = await record({
      requestId,
      chargedCostCenterId: unit.department.unitId,
      serviceMonth: `${next}-02-01`,
    });

    expect(recorded).toMatchObject({ booking: 'COST_CENTER', commitmentId: null });
    expect(await facts(unit, next)).toMatchObject({ spentMinor: BigInt(6 * M) });
    expect(await facts(unit)).toMatchObject({ spentMinor: 0n });
  });

  it('is a line of the subscription, with no commitment and no Cost Center, for an invoice of a subscription', async () => {
    const unit = await department();
    const subscriptionId = randomUUID();

    const recorded = await record({ subscriptionId });

    expect(recorded).toMatchObject({ booking: 'SUBSCRIPTION', subscriptionId, commitmentId: null, costCenterId: null });
    expect(await row(recorded.invoiceId)).toMatchObject({
      commitment_id: null,
      cost_center_id: null,
      subscription_id: subscriptionId,
    });
    expect(await facts(unit)).toMatchObject({ spentMinor: 0n });
  });

  it('keeps the exception the purchase invoice carries, and is never refused for being more than the commitment held', async () => {
    const { unit, requestId } = await committed();

    const recorded = await record({
      requestId,
      chargedCostCenterId: unit.department.unitId,
      netMinor: BigInt(25 * M),
      matchResult: 'PRICE_QUANTITY_EXCEPTION',
    });

    expect(recorded).toMatchObject({
      booking: 'COMMITMENT',
      matchResult: 'PRICE_QUANTITY_EXCEPTION',
      appliedMinor: BigInt(20 * M),
    });
    expect(await row(recorded.invoiceId)).toMatchObject({
      applied_minor: String(20 * M),
      actual_cost_minor: String(25 * M),
    });
    expect(await commitmentApplied(requestId)).toMatchObject({ state: 'EXPENSED' });
  });

  it('refuses a number the vendor already has, a purchase invoice recorded twice, and a place that is nowhere', async () => {
    const unit = await department();
    const purchaseInvoiceId = randomUUID();
    await record({
      number: 'DUP-1',
      purchaseInvoiceId,
      chargedCostCenterId: unit.department.unitId,
      requestId: randomUUID(),
    });

    const refused = (over: Partial<PurchaseInvoiceRecordInput>) =>
      record(over).then(
        () => null,
        (error: unknown) => (error instanceof PurchaseInvoiceRecordRefusedError ? error.reason : error),
      );
    expect(await refused({ number: 'DUP-1', chargedCostCenterId: unit.department.unitId })).toBe('DUPLICATE_NUMBER');
    expect(await refused({ purchaseInvoiceId, chargedCostCenterId: unit.department.unitId })).toBe('DUPLICATE_NUMBER');
    expect(await refused({ chargedCostCenterId: null })).toBe('NO_PLACE');
    expect(await refused({ netMinor: 0n, chargedCostCenterId: unit.department.unitId })).toBe('AMOUNT_NOT_POSITIVE');
  });
});
