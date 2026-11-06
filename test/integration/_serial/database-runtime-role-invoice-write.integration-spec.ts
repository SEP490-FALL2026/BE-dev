import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import { dropRoleSeparatedDatabase, type RoleSeparatedDatabase } from '../../support/role-separated-database';
import { InvoiceHarness } from '../../support/invoice-harness';

/**
 * `finance-screens-api`: the write path of an invoice runs as the runtime role. It needs the data rights the default privileges give
 * it, and only `INSERT` and `SELECT` on `invoices` (an invoice is added to and never changed): a table of the migration that the role
 * cannot write would fail here and not at the first invoice of production. One application for each file, as the other
 * `database-runtime-role-*` suites.
 */
describe('recording an invoice runs as the runtime role (integration, PostgreSQL)', () => {
  const h = new InvoiceHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('writes the invoice, takes the commitment down and audits it without any right beyond data', async () => {
    await h.withApprover();
    const plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    const unit = await h.departmentWithHead('P-RR-INV');
    await h.budgetFor(unit, { total: 100_000_000 });
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20_000_000 });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const commitmentId = h.dataOf<{ items: Array<{ id: string }> }>(
      await h.commitmentList(h.finance, { requestId }).expect(200),
    ).items[0].id;

    const response = await h
      .recordInvoice(commitmentId, {
        number: 'RR-1',
        issuedOn: '2026-11-03',
        netAmount: { amount: '12000000' },
        nonDeductibleTax: { amount: '600000' },
      })
      .expect(201);

    expect(h.dataOf<{ invoice: { actualCost: { amount: string } } }>(response).invoice.actualCost.amount).toBe(
      '12600000',
    );
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    const written = await h.ctx.sql.query<{ applied: string; invoices: number; events: number }>(
      `SELECT (SELECT applied_minor::text FROM budget_commitments WHERE id = $1) AS applied,
              (SELECT count(*)::int FROM invoices WHERE commitment_id = $1) AS invoices,
              (SELECT count(*)::int FROM audit_events WHERE action = 'INVOICE.RECORDED' AND after->>'commitmentId' = $2::text) AS events`,
      [commitmentId, commitmentId],
    );
    expect(written.rows[0]).toEqual({ applied: '12000000', invoices: 1, events: 1 });
  });
});
