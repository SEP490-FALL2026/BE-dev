import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { InvoiceRepo } from './invoice.repo';

/** The key a vendor's invoice number is compared by: lower case, no white space, as the purchase invoices compare it. */
const KEY = "lower(regexp_replace(number, '[[:space:]]', '', 'g'))";

/**
 * An invoice already recorded under a number blocks the same number whatever its case and white space (`INV 001` after `inv001`): the invoices of an older
 * generation were never compared that way. The unique index of this table stays as it is; only the check before the insert is wider.
 */
describe('InvoiceRepo.exists', () => {
  function build(found: boolean) {
    const calls: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join('?'), values });

        return Promise.resolve([{ found }]);
      }),
    } as unknown as DbTx;

    return { repo: new InvoiceRepo({} as PrismaService), tx, calls };
  }

  it('compares the number of the vendor by the lower case key without white space', async () => {
    const { repo, tx, calls } = build(true);

    expect(await repo.exists(tx, 'org', 'vendor', 'INV 001')).toBe(true);

    const { sql, values } = calls[0];
    expect(sql).toContain(KEY);
    expect(sql).toContain("= lower(regexp_replace(?::text, '[[:space:]]', '', 'g'))");
    expect(sql).not.toContain('\\s');
    expect(values).toEqual(['org', 'vendor', 'INV 001']);
  });

  it('says no when no invoice of the vendor has the key', async () => {
    const { repo, tx } = build(false);

    expect(await repo.exists(tx, 'org', 'vendor', 'inv001')).toBe(false);
  });
});

describe('InvoiceRepo pool variance closure', () => {
  it('appends a resolution row for a purchaseInvoiceId with poolVarianceInReview=true without updating invoices', async () => {
    const invoiceRow = {
      id: 'inv-1',
      organizationId: 'org-1',
      commitmentId: null,
      vendorId: 'v-1',
      number: 'INV-1',
      issuedOn: new Date('2027-02-05T00:00:00.000Z'),
      currency: 'VND',
      netMinor: 1_000_000n,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 0n,
      actualCostMinor: 1_000_000n,
      appliedMinor: 0n,
      matchResult: 'PRICE_QUANTITY_EXCEPTION',
      note: null,
      recordedByEmployeeId: 'emp-1',
      recordedAt: new Date('2027-02-05T01:00:00.000Z'),
      serviceMonth: new Date('2027-01-01T00:00:00.000Z'),
      purchaseInvoiceId: 'pi-1',
      subscriptionId: 'sub-1',
      costCenterId: null,
      outOfProcessCaseId: null,
      unallocatedReason: null,
      departmentId: null,
      poolExpectedMinor: 800_000n,
      poolVarianceMinor: 200_000n,
      poolVarianceMonth: new Date('2027-01-01T00:00:00.000Z'),
      poolVarianceInReview: true,
    };
    const findUnique = jest.fn().mockResolvedValue(invoiceRow);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      invoice: { findUnique },
      invoicePoolVarianceResolution: { createMany },
    } as unknown as DbTx;
    const repo = new InvoiceRepo({} as PrismaService);
    const resolvedAt = new Date('2027-02-10T00:00:00.000Z');

    const record = await repo.markPoolVarianceResolved(tx, 'pi-1', resolvedAt);

    expect(findUnique).toHaveBeenCalledWith({ where: { purchaseInvoiceId: 'pi-1' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ invoiceId: 'inv-1', resolvedAt }],
      skipDuplicates: true,
    });
    expect(record).toMatchObject({
      id: 'inv-1',
      poolExpectedMinor: 800_000n,
      poolVarianceMinor: 200_000n,
      poolVarianceMonth: '2027-01-01',
      poolVarianceInReview: false,
    });
  });

  it('finds by purchaseInvoiceId and reports poolVarianceInReview=false when resolved', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'inv-1',
      commitmentId: null,
      number: 'INV-1',
      issuedOn: new Date('2027-02-05T00:00:00.000Z'),
      currency: 'VND',
      netMinor: 1_000_000n,
      deductibleTaxMinor: 0n,
      nonDeductibleTaxMinor: 0n,
      actualCostMinor: 1_000_000n,
      matchResult: 'PRICE_QUANTITY_EXCEPTION',
      note: null,
      recordedByEmployeeId: 'emp-1',
      recordedAt: new Date('2027-02-05T01:00:00.000Z'),
      serviceMonth: new Date('2027-01-01T00:00:00.000Z'),
      purchaseInvoiceId: 'pi-1',
      poolExpectedMinor: 800_000n,
      poolVarianceMinor: 200_000n,
      poolVarianceMonth: new Date('2027-01-01T00:00:00.000Z'),
      poolVarianceInReview: true,
      poolVarianceResolution: { invoiceId: 'inv-1' },
    });
    const repo = new InvoiceRepo({ invoice: { findUnique } } as unknown as PrismaService);

    const record = await repo.findByPurchaseInvoiceId('pi-1');
    expect(record?.poolVarianceInReview).toBe(false);
  });
});

describe('InvoiceRepo.priceBasisOf (F-8)', () => {
  it('separates unallocated invoices, COST_CENTER invoice_allocations, and invoice_year_applications via UNION ALL without JOIN row multiplication', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn((query: TemplateStringsArray | { strings?: string[] }) => {
        const sql = Array.isArray(query)
          ? query.join('?')
          : ((query as { strings?: string[] }).strings?.join('?') ?? '');
        calls.push(sql);

        return Promise.resolve([{ cost_center_id: 'cc-1', year: 2026, basis: '900000', actual: '990000' }]);
      }),
    } as unknown as DbTx;
    const repo = new InvoiceRepo({} as PrismaService);

    const res = await repo.priceBasisOf([{ costCenterId: 'cc-1', year: 2026 }], tx, '2027-01-01');

    expect(res.get('cc-1:2026')).toEqual({ basisMinor: 900_000n, actualMinor: 990_000n });
    const sql = calls[0] ?? '';
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM invoice_allocations');
    expect(sql).toContain('FROM invoice_allocations l');
    expect(sql).toContain("l.bucket = 'COST_CENTER'");
    expect(sql).toContain('FROM invoice_year_applications a');
    expect(sql).toContain('UNION ALL');
    // Allocations and applications must never be joined in a single FROM clause (prevents row multiplication)
    expect(sql).not.toMatch(/FROM\s+invoice_allocations[\s\S]*JOIN\s+invoice_year_applications/i);
  });
});
