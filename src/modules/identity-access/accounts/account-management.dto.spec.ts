import { accountStatusChangeBodySchema, createAppUserBodySchema } from './account-management.dto';

describe('creating an account with one role', () => {
  const employeeId = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
  it('defaults to EMPLOYEE', () => {
    expect(createAppUserBodySchema.parse({ employeeId })).toEqual({ employeeId, role: 'EMPLOYEE' });
  });
  it.each(['IT_ADMIN', 'MANAGER', 'FINANCE'])('accepts one %s role', (role) => {
    expect(createAppUserBodySchema.parse({ employeeId, role })).toEqual({ employeeId, role });
  });
  it.each([[], ['EMPLOYEE'], ['EMPLOYEE', 'IT_ADMIN']])('rejects the retired roles array %j', (...roles) => {
    expect(createAppUserBodySchema.safeParse({ employeeId, roles }).success).toBe(false);
  });
});

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
