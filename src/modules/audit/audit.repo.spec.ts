import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { AuditRepo } from './audit.repo';

describe('earliest audit string field', () => {
  it.each([
    [[], null],
    [[{ value: null }], null],
    [[{ value: 'SHARED' }], 'SHARED'],
  ] as const)('returns only the projected string, or null for absent/non-string data (%j)', async (rows, expected) => {
    const query = jest.fn().mockResolvedValue(rows);
    expect(
      await new AuditRepo().firstAfterField(
        { $queryRaw: query } as unknown as DbTx,
        'INSTALLATION.ORGANIZATION_CREATED',
        'environment',
      ),
    ).toBe(expected);
    const call = query.mock.calls[0] as unknown[];
    expect(call.slice(1)).toEqual(['environment', 'environment', 'INSTALLATION.ORGANIZATION_CREATED']);
  });
});
