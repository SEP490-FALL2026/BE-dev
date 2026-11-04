import type { AppRole } from '../../public/identity-access.types';
import {
  checkRoleRequest,
  conflictingRoles,
  forbiddenPairInSet,
  forbidsCombination,
  isSelfChange,
  stopsLocking,
  validateRoleSet,
} from './account-administration.policy';

describe('account administration policy', () => {
  describe('checkRoleRequest', () => {
    it.each(['IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'] as const)(
      'accepts a hand-granted %s (US-01-01 AC-4, US-01-03 AC-1): the rules of the role are in the grant, not here',
      (role) => {
        expect(checkRoleRequest(role)).toBeNull();
      },
    );

    it('refuses SUPER_ADMIN, which only moves by transfer (AC-14)', () => {
      expect(checkRoleRequest('SUPER_ADMIN')).toBe('SUPER_ADMIN_TRANSFER_ONLY');
    });
  });

  describe('forbidsCombination (FR-8.7)', () => {
    it('forbids SUPER_ADMIN together with IT_ADMIN or FINANCE, in either order', () => {
      expect(forbidsCombination(['SUPER_ADMIN'], 'IT_ADMIN')).toBe(true);
      expect(forbidsCombination(['SUPER_ADMIN'], 'FINANCE')).toBe(true);
      expect(forbidsCombination(['IT_ADMIN'], 'SUPER_ADMIN')).toBe(true);
      expect(forbidsCombination(['FINANCE', 'EMPLOYEE'], 'SUPER_ADMIN')).toBe(true);
    });

    it('allows everything else, including EMPLOYEE beside any role and IT_ADMIN beside FINANCE', () => {
      expect(forbidsCombination(['SUPER_ADMIN'], 'EMPLOYEE')).toBe(false);
      expect(forbidsCombination(['IT_ADMIN'], 'FINANCE')).toBe(false);
      expect(forbidsCombination([], 'IT_ADMIN')).toBe(false);
    });
  });

  describe('conflictingRoles (QĐ-93b, US-01-01 AC-12, US-01-03 AC-11)', () => {
    const ALL: readonly AppRole[] = ['SUPER_ADMIN', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER'];
    /** The matrix of the spec, as the pairs that cannot be held together. */
    const FORBIDDEN: ReadonlyArray<readonly [AppRole, AppRole]> = [
      ['SUPER_ADMIN', 'IT_ADMIN'],
      ['SUPER_ADMIN', 'FINANCE'],
      ['SUPER_ADMIN', 'MANAGER'],
      ['SPENDING_APPROVER', 'SUPER_ADMIN'],
      ['SPENDING_APPROVER', 'IT_ADMIN'],
      ['SPENDING_APPROVER', 'FINANCE'],
      ['SPENDING_APPROVER', 'MANAGER'],
    ];
    const forbidden = (a: AppRole, b: AppRole) =>
      FORBIDDEN.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const pairs = ALL.flatMap((held) => ALL.map((adding) => [held, adding] as const)).filter(([a, b]) => a !== b);

    it.each(pairs.filter(([held, adding]) => forbidden(held, adding)))('refuses %s with %s', (held, adding) => {
      expect(conflictingRoles([held], adding)).toEqual([held]);
    });

    it.each(pairs.filter(([held, adding]) => !forbidden(held, adding)))('allows %s with %s', (held, adding) => {
      expect(conflictingRoles([held], adding)).toEqual([]);
    });

    it('refuses SPENDING_APPROVER with IT_ADMIN, FINANCE, MANAGER and SUPER_ADMIN, in either order, and names each role in the way', () => {
      expect(conflictingRoles(['IT_ADMIN', 'FINANCE', 'MANAGER'], 'SPENDING_APPROVER')).toEqual([
        'IT_ADMIN',
        'FINANCE',
        'MANAGER',
      ]);
      expect(conflictingRoles(['SPENDING_APPROVER'], 'MANAGER')).toEqual(['SPENDING_APPROVER']);
    });

    it('refuses SUPER_ADMIN with MANAGER', () => {
      expect(conflictingRoles(['MANAGER'], 'SUPER_ADMIN')).toEqual(['MANAGER']);
      expect(conflictingRoles(['SUPER_ADMIN'], 'MANAGER')).toEqual(['SUPER_ADMIN']);
    });

    it('allows EMPLOYEE with every role, and a role beside nothing', () => {
      for (const role of ALL) {
        expect(conflictingRoles(['EMPLOYEE'], role)).toEqual([]);
        expect(conflictingRoles([role], 'EMPLOYEE')).toEqual([]);
        expect(conflictingRoles([], role)).toEqual([]);
      }
    });

    it('agrees with forbidsCombination', () => {
      for (const [held, adding] of pairs) expect(forbidsCombination([held], adding)).toBe(forbidden(held, adding));
    });
  });

  describe('forbiddenPairInSet (the set of roles asked for at creation)', () => {
    it('names the first pair that cannot go together, whatever the order', () => {
      expect(forbiddenPairInSet(['SPENDING_APPROVER', 'EMPLOYEE', 'IT_ADMIN'])).toEqual([
        'SPENDING_APPROVER',
        'IT_ADMIN',
      ]);
      expect(forbiddenPairInSet(['IT_ADMIN', 'SPENDING_APPROVER'])).toEqual(['IT_ADMIN', 'SPENDING_APPROVER']);
      expect(forbiddenPairInSet(['MANAGER', 'SUPER_ADMIN'])).toEqual(['MANAGER', 'SUPER_ADMIN']);
    });

    it('finds none in a set that can be held together, and none in a set of one role or a repeated role', () => {
      expect(forbiddenPairInSet(['MANAGER', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE'])).toBeNull();
      expect(forbiddenPairInSet(['SPENDING_APPROVER', 'EMPLOYEE'])).toBeNull();
      expect(forbiddenPairInSet(['SPENDING_APPROVER', 'SPENDING_APPROVER'])).toBeNull();
      expect(forbiddenPairInSet([])).toBeNull();
    });
  });

  describe('validateRoleSet', () => {
    it('reports the first violation for a set requested at creation', () => {
      expect(validateRoleSet([])).toBeNull();
      expect(validateRoleSet(['IT_ADMIN', 'EMPLOYEE'])).toBeNull();
      expect(validateRoleSet(['IT_ADMIN', 'MANAGER'])).toBeNull();
      expect(validateRoleSet(['IT_ADMIN', 'SPENDING_APPROVER'])).toBe('ROLE_COMBINATION_FORBIDDEN');
      expect(validateRoleSet(['MANAGER', 'SPENDING_APPROVER'])).toBe('ROLE_COMBINATION_FORBIDDEN');
      expect(validateRoleSet(['SPENDING_APPROVER', 'EMPLOYEE'])).toBeNull();
      expect(validateRoleSet(['SUPER_ADMIN', 'IT_ADMIN'])).toBe('SUPER_ADMIN_TRANSFER_ONLY');
    });

    it('treats a repeated role as one', () => {
      expect(validateRoleSet(['EMPLOYEE', 'EMPLOYEE'])).toBeNull();
    });
  });

  describe('isSelfChange (AC-13)', () => {
    it('is true only for the caller own account', () => {
      expect(isSelfChange('a', 'a')).toBe(true);
      expect(isSelfChange('a', 'b')).toBe(false);
    });
  });

  describe('stopsLocking (AC-15, FR-8.10(b))', () => {
    it('stops locking the account that holds SUPER_ADMIN, independently of who asks', () => {
      expect(stopsLocking(['SUPER_ADMIN'])).toBe(true);
      expect(stopsLocking(['IT_ADMIN', 'EMPLOYEE'])).toBe(false);
      expect(stopsLocking([])).toBe(false);
    });
  });
});
