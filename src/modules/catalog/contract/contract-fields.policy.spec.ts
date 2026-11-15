import {
  ContractEffectiveFromRequiredError,
  ContractEffectiveRangeError,
  ContractIncompleteError,
  ContractNameRequiredError,
  ContractReasonRequiredError,
  ContractSubscriptionKindNotAllowedError,
  ContractSubscriptionVendorMismatchError,
  ContractUpdateEmptyError,
  ContractVendorRequiredError,
} from './contract.errors';
import {
  assertSubscriptionLinkable,
  changedContractFields,
  cleanChangeReason,
  contractStatusOf,
  newContractFields,
  numberKeyOf,
  sameContractFields,
  type ContractFields,
} from './contract-fields.policy';

const VENDOR = '11111111-1111-4111-8111-111111111111';
const OTHER_VENDOR = '22222222-2222-4222-8222-222222222222';

const complete: ContractFields = {
  name: 'Hợp đồng khung Atlassian',
  vendorId: VENDOR,
  number: 'HD-2026-07',
  effectiveFrom: '2026-01-01',
  effectiveTo: '2028-12-31',
  note: null,
};
/** A contract made when it was only a name: no vendor, no number, no day. */
const nameOnly: ContractFields = {
  name: 'Hợp đồng cũ',
  vendorId: null,
  number: null,
  effectiveFrom: null,
  effectiveTo: null,
  note: null,
};

/** What the action throws (undefined when it does not), to compare by what the error carries. */
function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('the status of a contract is read from its days (US-04-13 AC-12, AC-5)', () => {
  it.each([
    ['the day before it begins', '2025-12-15', 'NOT_YET_EFFECTIVE'],
    ['the day it begins', '2026-01-01', 'ACTIVE'],
    ['a day inside it', '2026-11-05', 'ACTIVE'],
    ['the day it ends', '2028-12-31', 'ACTIVE'],
    ['the day after it ends', '2029-01-01', 'EXPIRED'],
    ['a day long after it ends', '2029-01-02', 'EXPIRED'],
  ])('is %s: %s', (_when, today, status) => {
    expect(contractStatusOf(complete, today)).toBe(status);
  });

  it('is in effect for ever once it has begun when no day is given to which it ends', () => {
    const perpetual = { ...complete, effectiveFrom: '2026-03-15', effectiveTo: null };

    expect(contractStatusOf(perpetual, '2026-03-14')).toBe('NOT_YET_EFFECTIVE');
    expect(contractStatusOf(perpetual, '2026-03-15')).toBe('ACTIVE');
    expect(contractStatusOf(perpetual, '2126-03-15')).toBe('ACTIVE');
  });

  it('is incomplete while it has no vendor or no day from which it begins, whatever the day is', () => {
    expect(contractStatusOf(nameOnly, '2026-11-05')).toBe('INCOMPLETE');
    expect(contractStatusOf({ ...complete, vendorId: null }, '2026-11-05')).toBe('INCOMPLETE');
    expect(contractStatusOf({ ...complete, effectiveFrom: null, effectiveTo: null }, '2026-11-05')).toBe('INCOMPLETE');
  });
});

describe('what a new contract needs (US-04-13 AC-1, AC-3, AC-4, AC-5)', () => {
  const input = {
    name: '  Hợp đồng khung Atlassian ',
    vendorId: VENDOR,
    number: ' HD-2026-07 ',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2028-12-31',
    note: '  Ký ngày 28/12  ',
  };

  it('keeps every field, trimmed, and none that says what kind of contract it is', () => {
    expect(newContractFields(input)).toEqual({
      name: 'Hợp đồng khung Atlassian',
      vendorId: VENDOR,
      number: 'HD-2026-07',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2028-12-31',
      note: 'Ký ngày 28/12',
    });
  });

  it('takes a contract that never ends: no day to which it is in effect, with or without a day given (AC-3)', () => {
    expect(newContractFields({ ...input, effectiveTo: undefined }).effectiveTo).toBeNull();
    expect(newContractFields({ ...input, effectiveTo: null }).effectiveTo).toBeNull();
    expect(newContractFields({ ...input, effectiveTo: '2026-12-31' }).effectiveTo).toBe('2026-12-31');
  });

  it('takes a contract with no number and with no note, a blank one being none', () => {
    const bare = newContractFields({ ...input, number: undefined, note: undefined });
    const blank = newContractFields({ ...input, number: '   ', note: ' ' });

    expect(bare).toMatchObject({ number: null, note: null });
    expect(blank).toMatchObject({ number: null, note: null });
  });

  it('needs a name first, then a vendor (AC-5), then the day it begins', () => {
    expect(() => newContractFields({ ...input, name: '   ', vendorId: undefined })).toThrow(ContractNameRequiredError);
    expect(() => newContractFields({ ...input, name: '' })).toThrow(ContractNameRequiredError);
    expect(() => newContractFields({ ...input, vendorId: undefined, effectiveFrom: undefined })).toThrow(
      ContractVendorRequiredError,
    );
    expect(() => newContractFields({ ...input, effectiveFrom: undefined })).toThrow(ContractEffectiveFromRequiredError);
  });

  it('refuses an end before the beginning, and takes an end on the very day it begins', () => {
    expect(thrown(() => newContractFields({ ...input, effectiveTo: '2025-12-31' }))).toMatchObject({
      name: 'ContractEffectiveRangeError',
      problem: 'TO_BEFORE_FROM',
    });
    expect(newContractFields({ ...input, effectiveTo: '2026-01-01' }).effectiveTo).toBe('2026-01-01');
  });
});

describe('the number of a contract is read the way a name is (US-04-13 AC-4)', () => {
  it.each([
    ['HD-001', ' hd-001 '],
    ['HD-001', 'HD-001'],
    ['Số  HD 07', 'so hd 07'],
  ])('reads %s and %s as the same number', (a, b) => {
    expect(numberKeyOf(a)).toBe(numberKeyOf(b));
  });

  it('tells different numbers apart', () => {
    expect(numberKeyOf('HD-001')).not.toBe(numberKeyOf('HD-0012'));
  });
});

describe('what a change of a contract does (US-04-13 AC-5, AC-8)', () => {
  it('leaves what it does not name as it was, and changes what it names', () => {
    const next = changedContractFields(complete, { effectiveTo: '2029-06-30', note: 'Gia hạn thêm' });

    expect(next).toEqual({ ...complete, effectiveTo: '2029-06-30', note: 'Gia hạn thêm' });
  });

  it('clears the number, the end and the note with null, and never the vendor or the beginning', () => {
    const next = changedContractFields(complete, { number: null, effectiveTo: null, note: null });

    expect(next).toMatchObject({ number: null, effectiveTo: null, note: null, vendorId: VENDOR });
  });

  it('fills in an old contract that was only a name: vendor and days, and then it has a status', () => {
    const next = changedContractFields(nameOnly, { vendorId: VENDOR, effectiveFrom: '2026-02-01' });

    expect(next).toMatchObject({ vendorId: VENDOR, effectiveFrom: '2026-02-01', effectiveTo: null });
    expect(contractStatusOf(next, '2026-11-05')).toBe('ACTIVE');
  });

  it('refuses an end that is before the beginning, wherever either comes from', () => {
    expect(() => changedContractFields(complete, { effectiveTo: '2025-12-31' })).toThrow(ContractEffectiveRangeError);
    expect(() => changedContractFields(complete, { effectiveFrom: '2029-01-01' })).toThrow(ContractEffectiveRangeError);
    expect(() => changedContractFields(complete, { effectiveFrom: '2027-01-01', effectiveTo: '2026-12-31' })).toThrow(
      ContractEffectiveRangeError,
    );
  });

  it('refuses an end for an old contract that has no beginning, and says that is the problem', () => {
    expect(thrown(() => changedContractFields(nameOnly, { effectiveTo: '2026-12-31' }))).toMatchObject({
      name: 'ContractEffectiveRangeError',
      problem: 'TO_WITHOUT_FROM',
    });
  });

  it('refuses a blank name and a change that names nothing', () => {
    expect(() => changedContractFields(complete, { name: '  ' })).toThrow(ContractNameRequiredError);
    expect(() => changedContractFields(complete, {})).toThrow(ContractUpdateEmptyError);
  });

  it('knows a change that changes nothing', () => {
    const same = changedContractFields(complete, {
      vendorId: VENDOR,
      effectiveTo: '2028-12-31',
      name: ' ' + complete.name,
    });

    expect(sameContractFields(same, complete)).toBe(true);
    expect(sameContractFields({ ...same, note: 'x' }, complete)).toBe(false);
  });
});

describe('a change is made for a reason (US-04-13 AC-8)', () => {
  it('keeps the reason, trimmed', () => {
    expect(cleanChangeReason('  Gia hạn phụ lục 2  ')).toBe('Gia hạn phụ lục 2');
  });

  it.each([[''], ['   '], [undefined]])('refuses %j', (reason) => {
    expect(() => cleanChangeReason(reason)).toThrow(ContractReasonRequiredError);
  });
});

describe('which subscriptions a contract takes (US-04-13 AC-6, AC-7, AC-14; QĐ-111t)', () => {
  const k2 = { provisioningType: 'K2', subscriptionVendorId: VENDOR, contractVendorId: VENDOR };

  it.each([['K2'], ['K4']])('takes a subscription of a %s plan of the same vendor', (provisioningType) => {
    expect(() => assertSubscriptionLinkable({ ...k2, provisioningType })).not.toThrow();
  });

  it.each([['K1'], ['K5']])('refuses a subscription of a %s plan, the stock being not shared', (provisioningType) => {
    expect(thrown(() => assertSubscriptionLinkable({ ...k2, provisioningType }))).toMatchObject({
      name: 'ContractSubscriptionKindNotAllowedError',
      provisioningType,
    });
  });

  it('refuses the kind first, then a contract with no vendor, then another vendor', () => {
    expect(() =>
      assertSubscriptionLinkable({ provisioningType: 'K1', subscriptionVendorId: null, contractVendorId: null }),
    ).toThrow(ContractSubscriptionKindNotAllowedError);
    expect(() => assertSubscriptionLinkable({ ...k2, contractVendorId: null })).toThrow(ContractIncompleteError);
    expect(() => assertSubscriptionLinkable({ ...k2, contractVendorId: OTHER_VENDOR })).toThrow(
      ContractSubscriptionVendorMismatchError,
    );
  });

  it('refuses a subscription whose application has no vendor', () => {
    expect(() => assertSubscriptionLinkable({ ...k2, subscriptionVendorId: null })).toThrow(
      ContractSubscriptionVendorMismatchError,
    );
  });
});
