import { accountStatusChangeBodySchema } from './account-management.dto';

describe('accountStatusChangeBodySchema (lock and unlock reason)', () => {
  it('keeps the reason trimmed, so the Audit Trail stores what was meant', () => {
    expect(accountStatusChangeBodySchema.parse({ reason: '  Incident review  ' })).toEqual({
      reason: 'Incident review',
    });
  });

  it('accepts 1000 characters once trimmed and refuses 1001', () => {
    expect(accountStatusChangeBodySchema.safeParse({ reason: ` ${'a'.repeat(1000)} ` }).success).toBe(true);
    expect(accountStatusChangeBodySchema.safeParse({ reason: 'a'.repeat(1001) }).success).toBe(false);
  });

  it.each([
    ['no body', undefined],
    ['no reason', {}],
    ['an empty reason', { reason: '' }],
    ['a blank reason', { reason: ' \t\n ' }],
    ['a null reason', { reason: null }],
    ['a reason that is not a string', { reason: 7 }],
    ['an unknown field', { reason: 'Incident review', reference: 'second field' }],
  ])('refuses %s', (_label, body) => {
    expect(accountStatusChangeBodySchema.safeParse(body).success).toBe(false);
  });
});
