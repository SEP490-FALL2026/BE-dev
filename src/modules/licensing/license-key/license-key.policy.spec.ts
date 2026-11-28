import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import {
  LicenseKeyInitialActivationsExceedMaxError,
  LicenseKeyInitialActivationsOnAccountPlanError,
  LicenseKeyMaxActivationsNotRaisedError,
  LicenseKeyStateError,
} from './license-key.errors';
import { toLicenseKeyApiException } from './license-key.http-errors';
import {
  activationsUsedOf,
  assertAssignable,
  assertInitialActivationsAllowed,
  assertMaxActivationsRaised,
  assertWithdrawable,
  capReachedOf,
  capacityOf,
  freeOf,
  judgeBatch,
  maskKey,
  occupiedOf,
  resolveMaxActivations,
  warningOf,
  type KeyState,
} from './license-key.policy';

const key = (n: number) => `KEY-${String(n).padStart(4, '0')}-ABCDE-12345`;

describe('the judgement of a batch of keys (US-04-12 AC-1, AC-9)', () => {
  it('keeps every valid key, trimmed, with its line, and reports nothing for them', () => {
    const { rows, errors } = judgeBatch(['  KEY-0001-ABCDE-12345 ', 'abcd1234', 'A_b-c.d=e+f/g1']);

    expect(rows).toEqual([
      { line: 1, key: 'KEY-0001-ABCDE-12345' },
      { line: 2, key: 'abcd1234' },
      { line: 3, key: 'A_b-c.d=e+f/g1' },
    ]);
    expect(errors).toEqual([]);
  });

  it('reports a key of the wrong shape on its line and goes on with the others', () => {
    const { rows, errors } = judgeBatch([
      key(1),
      'short',
      key(2),
      'has a space inside',
      '',
      '   ',
      'x'.repeat(129),
      'café-0001-abcdef',
      key(3),
    ]);

    expect(rows.map((row) => row.line)).toEqual([1, 3, 9]);
    expect(errors).toEqual([
      { line: 2, code: 'INVALID_FORMAT' },
      { line: 4, code: 'INVALID_FORMAT' },
      { line: 5, code: 'INVALID_FORMAT' },
      { line: 6, code: 'INVALID_FORMAT' },
      { line: 7, code: 'INVALID_FORMAT' },
      { line: 8, code: 'INVALID_FORMAT' },
    ]);
  });

  it('takes a key of 8 and of 128 characters and no other length', () => {
    expect(judgeBatch(['x'.repeat(8), 'y'.repeat(128)]).errors).toEqual([]);
    expect(judgeBatch(['x'.repeat(7)]).errors).toEqual([{ line: 1, code: 'INVALID_FORMAT' }]);
  });

  it('keeps the first of a key that appears twice and reports the later one, ignoring spaces around it', () => {
    const { rows, errors } = judgeBatch([key(1), key(2), `  ${key(1)}  `, key(1)]);

    expect(rows.map((row) => row.line)).toEqual([1, 2]);
    expect(errors).toEqual([
      { line: 3, code: 'DUPLICATE_IN_BATCH' },
      { line: 4, code: 'DUPLICATE_IN_BATCH' },
    ]);
  });

  it('tells keys that differ only in case apart, because a license key is case sensitive', () => {
    const { rows, errors } = judgeBatch(['abcdefgh-1234', 'ABCDEFGH-1234']);

    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('never repeats a key in a message: an error names a line and a code, nothing else', () => {
    const { errors } = judgeBatch(['bad key with space']);

    expect(JSON.stringify(errors)).not.toContain('bad key');
  });
});

describe('the masked key of a list (US-04-12 AC-2)', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('KEY-0007-ABCDE-12345')).toBe('••••2345');
    expect(maskKey('abcd1234')).toBe('••••1234');
  });

  it('never gives back more of a short key than its tail', () => {
    expect(maskKey('12345678')).toBe('••••5678');
    expect(maskKey('12345678')).not.toContain('1234');
  });
});

describe('the capacity of a purchase (US-04-12 AC-1, AC-12, INV-01)', () => {
  it('is the smaller of the seats bought and the keys that can still be used', () => {
    expect(capacityOf({ purchased: 50, usableKeys: 50 })).toBe(50);
    expect(capacityOf({ purchased: 50, usableKeys: 48 })).toBe(48);
    expect(capacityOf({ purchased: 50, usableKeys: 52 })).toBe(50);
    expect(capacityOf({ purchased: 50, usableKeys: 0 })).toBe(0);
  });

  it('is nothing while the seats bought are not known: INV-01 cannot be judged', () => {
    expect(capacityOf({ purchased: null, usableKeys: 30 })).toBe(0);
  });

  it('warns when the number of keys is not the number bought, and when the number bought is not known', () => {
    expect(warningOf({ purchased: 50, usableKeys: 50 })).toBeNull();
    expect(warningOf({ purchased: 50, usableKeys: 48 })).toBe('KEY_COUNT_DIFFERS');
    expect(warningOf({ purchased: 50, usableKeys: 52 })).toBe('KEY_COUNT_DIFFERS');
    expect(warningOf({ purchased: null, usableKeys: 30 })).toBe('QUANTITY_UNKNOWN');
  });
});

describe('BR-MF1-09: the keys of the pool (QĐ-103d, QĐ-103v, Q-10 B)', () => {
  const free: KeyState = { subscriptionId: 'sub-1', status: 'IN_STORE', withdrawnAt: null };
  const problemOf = (run: () => void): string | null => {
    try {
      run();

      return null;
    } catch (error) {
      return error instanceof LicenseKeyStateError ? error.problem : 'OTHER';
    }
  };

  it('gives a free key of the store to a seat of its own purchase', () => {
    expect(problemOf(() => assertAssignable(free, 'sub-1'))).toBeNull();
  });

  it('refuses a key already assigned, a withdrawn key, and a key of another purchase', () => {
    expect(problemOf(() => assertAssignable({ ...free, status: 'ASSIGNED' }, 'sub-1'))).toBe('NOT_IN_STORE');
    expect(problemOf(() => assertAssignable({ ...free, withdrawnAt: new Date() }, 'sub-1'))).toBe('WITHDRAWN');
    expect(problemOf(() => assertAssignable(free, 'sub-2'))).toBe('SUBSCRIPTION_MISMATCH');
    expect(problemOf(() => assertAssignable(free, null))).toBe('SUBSCRIPTION_MISMATCH');
  });

  it('withdraws only a free key, once', () => {
    expect(problemOf(() => assertWithdrawable(free))).toBeNull();
    expect(problemOf(() => assertWithdrawable({ ...free, status: 'ASSIGNED' }))).toBe('ASSIGNED');
    expect(problemOf(() => assertWithdrawable({ ...free, withdrawnAt: new Date() }))).toBe('ALREADY_WITHDRAWN');
  });
});

describe('the capacity of a purchase of keys bound to a machine (KHOA-07, W2-21)', () => {
  it('counts the licenses bought, not the keys, for a key that goes on a machine: one key can be on many machines', () => {
    expect(capacityOf({ purchased: 25, usableKeys: 1, keyBinding: 'DEVICE_KEY' })).toBe(25);
    expect(capacityOf({ purchased: null, usableKeys: 3, keyBinding: 'DEVICE_KEY' })).toBe(0);
  });

  it('keeps the smaller of the licenses and the keys for a key given to an account, as before', () => {
    expect(capacityOf({ purchased: 25, usableKeys: 20, keyBinding: 'ACCOUNT' })).toBe(20);
    expect(capacityOf({ purchased: 25, usableKeys: 30, keyBinding: null })).toBe(25);
  });

  it('counts what is taken from the machines for a key on a machine and the keys given to a seat for a key on an account', () => {
    expect(occupiedOf({ keyBinding: 'DEVICE_KEY', assignedKeys: 7, deviceOccupied: 10 })).toBe(10);
    expect(occupiedOf({ keyBinding: 'ACCOUNT', assignedKeys: 7, deviceOccupied: 10 })).toBe(7);
  });

  it('frees what is left of the capacity, never below zero', () => {
    expect(freeOf(25, 10)).toBe(15);
    expect(freeOf(25, 30)).toBe(0);
  });

  it('does not warn that the keys differ from the licenses for a key on a machine, only that the licenses are unknown', () => {
    expect(warningOf({ purchased: 25, usableKeys: 1, keyBinding: 'DEVICE_KEY' })).toBeNull();
    expect(warningOf({ purchased: null, usableKeys: 1, keyBinding: 'DEVICE_KEY' })).toBe('QUANTITY_UNKNOWN');
    expect(warningOf({ purchased: 25, usableKeys: 20, keyBinding: 'ACCOUNT' })).toBe('KEY_COUNT_DIFFERS');
  });
});

describe('the activations of a key (KHOA-08, C-6)', () => {
  it('takes the cap the IT Admin names, else the install limit of the terms of the plan, else one', () => {
    expect(resolveMaxActivations(30, 5)).toBe(30);
    expect(resolveMaxActivations(undefined, 5)).toBe(5);
    expect(resolveMaxActivations(undefined, null)).toBe(1);
  });

  it('never gives a cap above what the column holds, even from an install limit', () => {
    expect(resolveMaxActivations(undefined, 250000)).toBe(100000);
  });

  it('counts the activations used as the ones already used when the key was entered and every operation since, closed or not', () => {
    expect(activationsUsedOf(9, 3)).toBe(12);
    expect(activationsUsedOf(0, 0)).toBe(0);
  });

  it('says the cap is reached once the activations used are as many as it allows', () => {
    expect(capReachedOf(12, 30)).toBe(false);
    expect(capReachedOf(30, 30)).toBe(true);
    expect(capReachedOf(31, 30)).toBe(true);
  });

  it('lets a batch tell no activations already used, or as many as the cap allows, for a plan whose keys go to machines', () => {
    expect(() =>
      assertInitialActivationsAllowed({ initial: 0, maxActivations: 1, keyBinding: 'ACCOUNT' }),
    ).not.toThrow();
    expect(() =>
      assertInitialActivationsAllowed({ initial: 0, maxActivations: 1, keyBinding: 'DEVICE_KEY' }),
    ).not.toThrow();
    expect(() =>
      assertInitialActivationsAllowed({ initial: 5, maxActivations: 5, keyBinding: 'DEVICE_KEY' }),
    ).not.toThrow();
  });

  it('refuses activations already used above the cap of the batch', () => {
    for (const input of [
      { initial: 6, maxActivations: 5, keyBinding: 'DEVICE_KEY' as const },
      { initial: 2, maxActivations: 1, keyBinding: 'DEVICE_KEY' as const },
    ]) {
      try {
        assertInitialActivationsAllowed(input);
        throw new Error('Expected LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX');
      } catch (error) {
        expect(error).toBeInstanceOf(LicenseKeyInitialActivationsExceedMaxError);
        const mapped = toLicenseKeyApiException(error);
        expect(mapped).toBeInstanceOf(ApiException);
        expect((mapped as ApiException).getResponse()).toMatchObject({
          code: 'LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX',
        });
      }
    }
  });

  it('refuses activations already used on a plan whose keys go to an account: only its machines count them', () => {
    try {
      assertInitialActivationsAllowed({ initial: 1, maxActivations: 5, keyBinding: 'ACCOUNT' });
      throw new Error('Expected LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN');
    } catch (error) {
      expect(error).toBeInstanceOf(LicenseKeyInitialActivationsOnAccountPlanError);
      const mapped = toLicenseKeyApiException(error);
      expect(mapped).toBeInstanceOf(ApiException);
      expect((mapped as ApiException).getResponse()).toMatchObject({
        code: 'LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN',
      });
    }
  });

  it('lets the cap only go up', () => {
    expect(() => assertMaxActivationsRaised(30, 40)).not.toThrow();
    for (const next of [35, 40]) {
      try {
        assertMaxActivationsRaised(40, next);
        throw new Error('Expected LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED');
      } catch (error) {
        expect(error).toBeInstanceOf(LicenseKeyMaxActivationsNotRaisedError);
        const mapped = toLicenseKeyApiException(error);
        expect(mapped).toBeInstanceOf(ApiException);
        expect((mapped as ApiException).getResponse()).toMatchObject({
          code: 'LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED',
        });
      }
    }
  });
});
