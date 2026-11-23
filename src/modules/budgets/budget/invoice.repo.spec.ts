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
