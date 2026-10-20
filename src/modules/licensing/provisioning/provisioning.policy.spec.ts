import {
  ProvisioningAnotherItAdminNeededError,
  ProvisioningEvidenceRequiredError,
  ProvisioningPersonalAccountError,
  ProvisioningReasonRequiredError,
  ProvisioningSubscriptionError,
  ProvisioningTaskNotManualError,
  ProvisioningTaskStateError,
  ProvisioningTypeNotSupportedError,
} from '../licensing.errors';
import {
  assertGrantableType,
  assertSubscriptionChoice,
  chooseAccount,
  cleanEvidence,
  cleanFailureReason,
  doneWhenFor,
  inGeneralQueue,
  nextStatus,
  selfExecution,
  stepsFor,
} from './provisioning.policy';

const DOMAINS = ['congty.vn'];

describe('steps of a task by the kind of provisioning (US-07-02 AC-4, US-07-01 AC-7, AC-8)', () => {
  it('K1 asks for the purchase on the company account of the work email, then the confirmation', () => {
    expect(stepsFor('K1', 'e1@congty.vn')).toEqual([
      { code: 'BUY_ON_COMPANY_ACCOUNT', accountIdentifier: 'e1@congty.vn' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
  });

  it('K2 adds the company email to the workspace with the admin identity of whoever does the work, never a shared one', () => {
    expect(stepsFor('K2', 'e1@congty.vn')).toEqual([
      { code: 'ADD_TO_WORKSPACE', accountIdentifier: 'e1@congty.vn', adminIdentity: 'ACTING_IT_ADMIN' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
  });

  it('K5 is done by hand in the internal software, with no account to buy and no workspace', () => {
    expect(stepsFor('K5', 'e1@congty.vn')).toEqual([
      { code: 'GRANT_IN_INTERNAL_SOFTWARE', accountIdentifier: 'e1@congty.vn' },
      { code: 'CONFIRM_WITH_EVIDENCE' },
    ]);
  });

  it('K4 leads to the key store and a company device, which a later item makes possible', () => {
    expect(stepsFor('K4', 'e1@congty.vn').map((step) => step.code)).toEqual([
      'OPEN_KEY_STORE',
      'ASSIGN_KEY_WITH_COMPANY_DEVICE',
      'CONFIRM_WITH_EVIDENCE',
    ]);
  });

  it('every kind that has a card ends with the confirmation, and each says when the work is done', () => {
    for (const type of ['K1', 'K2', 'K4', 'K5'] as const) {
      expect(stepsFor(type, 'a@congty.vn').at(-1)).toEqual({ code: 'CONFIRM_WITH_EVIDENCE' });
    }
    expect(doneWhenFor('K1')).toBe('PURCHASE_CONFIRMED');
    expect(doneWhenFor('K2')).toBe('MEMBER_ACTIVE');
    expect(doneWhenFor('K4')).toBe('KEY_ASSIGNED_WITH_DEVICE');
    expect(doneWhenFor('K5')).toBe('CONFIRMED_WITH_EVIDENCE');
  });

  it('K3 is only specified: it has no card', () => {
    expect(stepsFor('K3', 'a@congty.vn')).toEqual([]);
  });
});

describe('the kinds that can be granted now (US-07-01 AC-10 deferred, RB-4)', () => {
  it.each(['K1', 'K2', 'K5'] as const)('accepts %s', (type) => {
    expect(() => assertGrantableType(type)).not.toThrow();
  });

  it.each(['K3', 'K4'] as const)('refuses %s until what it needs exists', (type) => {
    expect(() => assertGrantableType(type)).toThrow(ProvisioningTypeNotSupportedError);
  });
});

describe('the subscription of a grant (US-07-01 AC-1, AC-11)', () => {
  it.each(['K1', 'K2'] as const)('is required for %s', (type) => {
    expect(() => assertSubscriptionChoice(type, undefined)).toThrow(new ProvisioningSubscriptionError('REQUIRED'));
    expect(() => assertSubscriptionChoice(type, 'sub-1')).not.toThrow();
  });

  it('is not allowed for K5, which holds no seat and takes no subscription', () => {
    expect(() => assertSubscriptionChoice('K5', 'sub-1')).toThrow(new ProvisioningSubscriptionError('NOT_ALLOWED'));
    expect(() => assertSubscriptionChoice('K5', undefined)).not.toThrow();
  });
});

describe('the account of a grant is the company account (US-07-01 AC-9, FR-2.9)', () => {
  it('is the work email unless another company address is named', () => {
    expect(chooseAccount({ workEmail: 'e1@congty.vn', requested: undefined, companyDomains: DOMAINS })).toBe(
      'e1@congty.vn',
    );
    expect(
      chooseAccount({ workEmail: 'e1@congty.vn', requested: ' E1.Alias@it.congty.vn ', companyDomains: DOMAINS }),
    ).toBe('E1.Alias@it.congty.vn');
  });

  it.each([
    ['a personal address', 'e1.private@gmail.com'],
    ['an address of another company', 'e1@khac.vn'],
    ['a name that is not an email', 'e1'],
  ])('refuses %s', (_name, requested) => {
    expect(() => chooseAccount({ workEmail: 'e1@congty.vn', requested, companyDomains: DOMAINS })).toThrow(
      ProvisioningPersonalAccountError,
    );
  });

  it('refuses when the person has no work email, and when the work email is on a free provider', () => {
    expect(() => chooseAccount({ workEmail: null, requested: undefined, companyDomains: DOMAINS })).toThrow(
      ProvisioningPersonalAccountError,
    );
    expect(() => chooseAccount({ workEmail: 'e1@gmail.com', requested: undefined, companyDomains: DOMAINS })).toThrow(
      ProvisioningPersonalAccountError,
    );
  });
});

describe('the evidence and the reason (US-07-02 AC-5, AC-6)', () => {
  it('keeps a note trimmed and refuses a blank one', () => {
    expect(cleanEvidence('  đã mua gói, biên lai số 12  ')).toBe('đã mua gói, biên lai số 12');
    expect(() => cleanEvidence('')).toThrow(ProvisioningEvidenceRequiredError);
    expect(() => cleanEvidence(' \n\t ')).toThrow(ProvisioningEvidenceRequiredError);
  });

  it('keeps the reason of a failure trimmed and refuses a blank one', () => {
    expect(cleanFailureReason(' nhà cung cấp từ chối ')).toBe('nhà cung cấp từ chối');
    expect(() => cleanFailureReason('   ')).toThrow(ProvisioningReasonRequiredError);
  });
});

describe('the life of a task (US-07-02 AC-2, AC-3, AC-6)', () => {
  it('goes from queued to in progress, and from in progress to completed or failed', () => {
    expect(nextStatus('QUEUED', 'CLAIM', 'MANUAL')).toBe('IN_PROGRESS');
    expect(nextStatus('IN_PROGRESS', 'CLAIM', 'MANUAL')).toBe('IN_PROGRESS');
    expect(nextStatus('IN_PROGRESS', 'COMPLETE', 'MANUAL')).toBe('COMPLETED');
    expect(nextStatus('IN_PROGRESS', 'FAIL', 'MANUAL')).toBe('FAILED');
  });

  it.each([
    ['QUEUED', 'COMPLETE'],
    ['QUEUED', 'FAIL'],
    ['COMPLETED', 'COMPLETE'],
    ['COMPLETED', 'FAIL'],
    ['FAILED', 'COMPLETE'],
    ['FAILED', 'FAIL'],
  ] as const)('does not let a %s task %s', (status, action) => {
    expect(() => nextStatus(status, action, 'MANUAL')).toThrow(new ProvisioningTaskStateError('NOT_IN_PROGRESS'));
  });

  it.each(['COMPLETED', 'FAILED'] as const)('does not let a %s task be taken up again', (status) => {
    expect(() => nextStatus(status, 'CLAIM', 'MANUAL')).toThrow(new ProvisioningTaskStateError('NOT_CLAIMABLE'));
  });

  it('leaves the automatic channel to the connector: no one takes it, completes it or fails it by hand', () => {
    for (const action of ['CLAIM', 'COMPLETE', 'FAIL'] as const) {
      expect(() => nextStatus('QUEUED', action, 'CONNECTOR')).toThrow(ProvisioningTaskNotManualError);
    }
  });
});

describe('the general queue (US-01-11 AC-4, AC-8)', () => {
  it('holds a task nobody is in charge of, or whose person in charge no longer works', () => {
    expect(inGeneralQueue({ defaultResponsibleEmployeeId: null, responsibleStillWorks: false })).toBe(true);
    expect(inGeneralQueue({ defaultResponsibleEmployeeId: 'a1', responsibleStillWorks: false })).toBe(true);
    expect(inGeneralQueue({ defaultResponsibleEmployeeId: 'a1', responsibleStillWorks: true })).toBe(false);
  });
});

describe('an IT Admin who is the beneficiary (US-01-05 AC-12, QĐ-77m)', () => {
  it('works on a task of someone else without any condition', () => {
    expect(selfExecution({ actorEmployeeId: 'a2', beneficiaryEmployeeId: 'e1', otherUsableItAdmins: 0 })).toBe('ALLOW');
  });

  it('is refused while another IT Admin can do it', () => {
    expect(() => {
      selfExecution({ actorEmployeeId: 'a1', beneficiaryEmployeeId: 'a1', otherUsableItAdmins: 1 });
    }).toThrow(ProvisioningAnotherItAdminNeededError);
  });

  it('may do it when no other IT Admin can, and the act is marked as self-executed', () => {
    expect(selfExecution({ actorEmployeeId: 'a1', beneficiaryEmployeeId: 'a1', otherUsableItAdmins: 0 })).toBe(
      'ALLOW_SELF_EXECUTED',
    );
  });
});
