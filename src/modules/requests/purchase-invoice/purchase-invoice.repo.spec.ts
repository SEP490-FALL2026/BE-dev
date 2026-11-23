import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PurchaseInvoiceRepo } from './purchase-invoice.repo';

/** The key a vendor's invoice number is compared by: lower case, no white space. The migration of the unique index writes the same expression. */
const KEY = "lower(regexp_replace(number, '[[:space:]]', '', 'g'))";

/**
 * A number is taken whatever its case and white space (`INV-001`, `inv - 001` and `Inv-001` are one), until the invoice carrying it is returned. The comparison is
 * written in SQL, in the expression of the unique index, so the check and the index never disagree.
 */
describe('PurchaseInvoiceRepo.numberIsOpen', () => {
  function build(found: boolean) {
    const calls: { sql: string; values: unknown[] }[] = [];
    const tx = {
      $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join('?'), values });

        return Promise.resolve([{ found }]);
      }),
    } as unknown as DbTx;

    return { repo: new PurchaseInvoiceRepo({} as PrismaService), tx, calls };
  }

  it('compares the lower case number without white space of the column with the one asked, among the invoices not returned', async () => {
    const { repo, tx, calls } = build(true);

    expect(await repo.numberIsOpen(tx, 'org', 'vendor', 'INV 001')).toBe(true);

    const { sql, values } = calls[0];
    expect(sql).toContain(KEY);
    expect(sql).toContain("= lower(regexp_replace(?::text, '[[:space:]]', '', 'g'))");
    expect(sql).toContain("state <> 'RETURNED'");
    expect(values).toEqual(['org', 'vendor', 'INV 001']);
  });

  it('writes the white space class as [[:space:]], never as a backslash class a JavaScript template would lose', async () => {
    const { repo, tx, calls } = build(false);

    expect(await repo.numberIsOpen(tx, 'org', 'vendor', 'inv001')).toBe(false);
    expect(calls[0].sql).not.toContain('\\s');
  });
});
