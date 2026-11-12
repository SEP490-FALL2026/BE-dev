import { renewalItAdminOf } from './renewal-it-admin.policy';

describe('the IT Admin a renewal concerns (QĐ-111g, BB-9, CO-6)', () => {
  it('is the IT Admin responsible for the subscription while they are a usable IT Admin', () => {
    expect(
      renewalItAdminOf({
        responsibleItAdminEmployeeId: 'it-sub',
        responsibleIsUsable: true,
        departmentFallback: 'it-dept',
      }),
    ).toBe('it-sub');
  });

  it('falls back to the IT Admin in charge of the owner department when the subscription names none', () => {
    expect(
      renewalItAdminOf({
        responsibleItAdminEmployeeId: null,
        responsibleIsUsable: false,
        departmentFallback: 'it-dept',
      }),
    ).toBe('it-dept');
  });

  it('falls back to it too when the one named is no longer a usable IT Admin (left, locked, lost the role)', () => {
    expect(
      renewalItAdminOf({
        responsibleItAdminEmployeeId: 'it-gone',
        responsibleIsUsable: false,
        departmentFallback: 'it-dept',
      }),
    ).toBe('it-dept');
  });

  it('is nobody when nobody is named and the department has no usable IT Admin either', () => {
    expect(
      renewalItAdminOf({ responsibleItAdminEmployeeId: null, responsibleIsUsable: false, departmentFallback: null }),
    ).toBeNull();
  });

  it('keeps the old rule for a subscription of the shared pool (no responsible IT Admin to read, department fallback only)', () => {
    expect(
      renewalItAdminOf({
        responsibleItAdminEmployeeId: null,
        responsibleIsUsable: false,
        departmentFallback: 'first-usable',
      }),
    ).toBe('first-usable');
  });
});
