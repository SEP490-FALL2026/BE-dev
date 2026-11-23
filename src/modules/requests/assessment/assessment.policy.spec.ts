import type { AssessmentFields, Quote } from '../access-request/assessment-record.types';
import {
  actsForAssignee,
  assessmentScopeOf,
  canLinkCatalogPlan,
  checkAssessor,
  internalRegistrationBasis,
  judgeCompletion,
  missingFields,
  monthlyPriceOfQuote,
  registeredShapeOf,
} from './assessment.policy';

const quote: Quote = {
  unitPrice: { amountMinor: 800n, currency: 'USD' },
  originalPrice: null,
  billingCycle: 'MONTHLY',
  validFrom: '2026-10-01',
  validUntil: null,
};
const complete = (over: Partial<AssessmentFields> = {}): AssessmentFields => ({
  classification: 'PAID_LICENSED',
  vendorName: 'Miro',
  plannedPlanName: 'Business',
  provisioningType: 'K2',
  adminConsole: true,
  memberExport: true,
  sso: false,
  termsSummary: 'Annual terms, sharing not allowed',
  memberUsageMethod: 'Admin console export',
  grantRevokeMethod: 'Invite and remove by email',
  dataSensitivity: 'MEDIUM',
  opinionStatus: null,
  opinionNote: null,
  controlLevel: 'PARTIAL',
  quote,
  ...over,
});
const empty: AssessmentFields = {
  classification: null,
  vendorName: null,
  plannedPlanName: null,
  provisioningType: null,
  adminConsole: null,
  memberExport: null,
  sso: null,
  termsSummary: null,
  memberUsageMethod: null,
  grantRevokeMethod: null,
  dataSensitivity: null,
  opinionStatus: null,
  opinionNote: null,
  controlLevel: null,
  quote: null,
};

describe('completing the assessment of paid or licensed software (US-05-06)', () => {
  it('is complete with the minimum, the control level and the quote (AC-2)', () => {
    expect(judgeCompletion(complete())).toEqual({ kind: 'OK' });
  });

  it('names every field still to give, in the order a screen shows them (AC-3)', () => {
    expect(judgeCompletion({ ...empty, classification: 'PAID_LICENSED' })).toEqual({
      kind: 'INCOMPLETE',
      missing: [
        'vendorName',
        'plannedPlanName',
        'provisioningType',
        'adminConsole',
        'memberExport',
        'sso',
        'termsSummary',
        'memberUsageMethod',
        'grantRevokeMethod',
        'dataSensitivity',
        'controlLevel',
        'quote',
      ],
    });
  });

  it.each([
    ['the way a seat is granted and revoked', { grantRevokeMethod: null }, 'grantRevokeMethod'],
    ['whether the tool has an admin console, said no or yes', { adminConsole: null }, 'adminConsole'],
    ['the quote', { quote: null }, 'quote'],
    ['the control level', { controlLevel: null }, 'controlLevel'],
  ] as const)('is not complete without %s', (_name, over, field) => {
    expect(judgeCompletion(complete(over))).toEqual({ kind: 'INCOMPLETE', missing: [field] });
  });

  it('accepts a flag that is false: no is an answer', () => {
    expect(missingFields(complete({ adminConsole: false, memberExport: false, sso: false }))).toEqual([]);
  });

  describe('highly sensitive data (AC-7)', () => {
    it('needs the opinion that was obtained, or the word that there is none with its reason', () => {
      expect(missingFields(complete({ dataSensitivity: 'HIGH' }))).toEqual(['opinion.status']);
      expect(missingFields(complete({ dataSensitivity: 'HIGH', opinionStatus: 'NOT_AVAILABLE' }))).toEqual([
        'opinion.note',
      ]);
      expect(
        missingFields(
          complete({ dataSensitivity: 'HIGH', opinionStatus: 'NOT_AVAILABLE', opinionNote: 'No equivalent owner' }),
        ),
      ).toEqual([]);
      expect(missingFields(complete({ dataSensitivity: 'HIGH', opinionStatus: 'OBTAINED' }))).toEqual([]);
    });

    it('is not asked of data that is not highly sensitive', () => {
      expect(missingFields(complete({ dataSensitivity: 'MEDIUM', opinionStatus: null }))).toEqual([]);
    });
  });

  describe('what is not completed here', () => {
    it('has no way out without a classification', () => {
      expect(judgeCompletion(complete({ classification: null }))).toEqual({
        kind: 'INCOMPLETE',
        missing: ['classification'],
      });
    });

    it('internal software is completed by registering it, however complete the form is (AC-11)', () => {
      expect(judgeCompletion(complete({ classification: 'INTERNAL' }))).toEqual({ kind: 'INTERNAL_BY_REGISTRATION' });
      expect(judgeCompletion({ ...empty, classification: 'INTERNAL' })).toEqual({ kind: 'INTERNAL_BY_REGISTRATION' });
    });

    it('a tool that cannot be controlled is refused at the gate, even with fields missing', () => {
      expect(judgeCompletion(complete({ controlLevel: 'UNCONTROLLABLE' }))).toEqual({ kind: 'UNCONTROLLABLE' });
      expect(judgeCompletion({ ...empty, classification: 'PAID_LICENSED', controlLevel: 'UNCONTROLLABLE' })).toEqual({
        kind: 'UNCONTROLLABLE',
      });
    });
  });
});

describe('who may fill the assessment and when', () => {
  const facts = {
    actorEmployeeId: 'it1',
    requesterEmployeeId: 'e1',
    beneficiaryEmployeeIds: ['e1'],
    requestState: 'AWAITING_IT_ASSESSMENT' as const,
    actingItAdminIds: ['it1'],
  };

  it('an acting IT Admin who is not the sender may, while the request waits for the assessment', () => {
    expect(checkAssessor(facts)).toBeNull();
    expect(checkAssessor({ ...facts, actorEmployeeId: 'sub1', actingItAdminIds: ['it1', 'sub1'] })).toBeNull();
  });

  it('nobody assesses a request they asked or are given (checked before state and acting scope)', () => {
    expect(checkAssessor({ ...facts, actorEmployeeId: 'e1', actingItAdminIds: ['e1'] })).toBe('OWN_REQUEST');
    expect(
      checkAssessor({
        ...facts,
        actorEmployeeId: 'e1',
        requestState: 'PENDING',
        actingItAdminIds: [],
      }),
    ).toBe('OWN_REQUEST');
    expect(
      checkAssessor({ ...facts, actorEmployeeId: 'e2', beneficiaryEmployeeIds: ['e2'], actingItAdminIds: [] }),
    ).toBe('OWN_REQUEST');
  });

  it.each(['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION', 'AWAITING_EXECUTION', 'REJECTED'] as const)(
    'nobody changes it when the request is %s (checked before acting scope)',
    (requestState) => {
      expect(checkAssessor({ ...facts, requestState, actingItAdminIds: [] })).toBe('NOT_AWAITING_ASSESSMENT');
    },
  );

  it('refuses an IT Admin who is not acting for the requester department', () => {
    expect(checkAssessor({ ...facts, actorEmployeeId: 'it2', actingItAdminIds: ['it1'] })).toBe(
      'ASSESSMENT_NOT_IN_CHARGE',
    );
    expect(checkAssessor({ ...facts, actingItAdminIds: [] })).toBe('ASSESSMENT_NOT_IN_CHARGE');
  });
});

describe('linking a request to the plan registered in the catalog (US-05-06 AC-4, AC-8)', () => {
  it('only a proposal that waits for its grant and has no plan yet', () => {
    expect(canLinkCatalogPlan({ branch: 'NEW_SOFTWARE', state: 'AWAITING_EXECUTION', planId: null })).toBe(true);
  });

  it.each([
    ['before the assessment is done', { branch: 'NEW_SOFTWARE', state: 'AWAITING_IT_ASSESSMENT', planId: null }],
    ['before the spend is decided', { branch: 'NEW_SOFTWARE', state: 'AWAITING_SPEND_SUBMISSION', planId: null }],
    ['a plan that is already linked', { branch: 'NEW_SOFTWARE', state: 'AWAITING_EXECUTION', planId: 'p1' }],
    [
      'a request for software that is in the catalog',
      { branch: 'PAID_IN_CATALOG', state: 'AWAITING_EXECUTION', planId: null },
    ],
  ] as const)('not %s', (_name, facts) => {
    expect(canLinkCatalogPlan(facts)).toBe(false);
  });
});

describe('who the IT Admin works for when they save, complete or refuse an assessment (US-05-06)', () => {
  it.each([
    ['a step held by somebody else', { assigneeEmployeeId: 'it-2' }, true],
    ['a step that nobody holds, as the audit has always said', { assigneeEmployeeId: null }, true],
    ['their own step', { assigneeEmployeeId: 'it-1' }, false],
    ['no step at all', null, false],
  ])('says whether they stand in for the assignee on %s (actsForAssignee)', (_label, step, acts) => {
    expect(actsForAssignee(step, 'it-1')).toBe(acts);
  });
});

describe('registering internal software for a proposal (US-05-20 AC-3 -> AC-5, AC-8 -> AC-10)', () => {
  it('takes only software the company built itself, then the sensitivity given or the one the assessment has', () => {
    expect(internalRegistrationBasis({ classification: 'PAID_LICENSED', dataSensitivity: 'LOW' }, 'HIGH')).toEqual({
      kind: 'NOT_INTERNAL',
    });
    expect(internalRegistrationBasis({ classification: 'INTERNAL', dataSensitivity: 'LOW' }, 'HIGH')).toEqual({
      kind: 'OK',
      dataSensitivity: 'HIGH',
    });
    expect(internalRegistrationBasis({ classification: 'INTERNAL', dataSensitivity: 'LOW' }, undefined)).toEqual({
      kind: 'OK',
      dataSensitivity: 'LOW',
    });
  });

  it('is incomplete when neither the body nor the assessment says how sensitive the data is', () => {
    expect(internalRegistrationBasis({ classification: 'INTERNAL', dataSensitivity: null }, undefined)).toEqual({
      kind: 'DATA_SENSITIVITY_MISSING',
    });
  });

  it('judges classification before sensitivity: software that is not internal is refused whatever else is missing', () => {
    expect(internalRegistrationBasis({ classification: null, dataSensitivity: null }, undefined)).toEqual({
      kind: 'NOT_INTERNAL',
    });
  });

  const sent = {
    version: 3,
    branch: 'NEW_SOFTWARE' as const,
    chain: ['NEED', 'IT_ASSESSMENT', 'SPEND_APPROVAL', 'IT_EXECUTION'] as const,
    slaWorkingDays: 2,
  };

  it('keeps the chain as it was sent and waits for the spend when the grant needs a payment (AC-10)', () => {
    expect(registeredShapeOf(true, { ...sent, chain: [...sent.chain] })).toEqual({
      branch: 'NEW_SOFTWARE',
      policy: { ...sent, chain: [...sent.chain] },
      state: 'AWAITING_SPEND_SUBMISSION',
    });
  });

  it('drops the spend step and goes to the IT Admin to be granted by hand when nothing is paid (AC-1)', () => {
    expect(registeredShapeOf(false, { ...sent, chain: [...sent.chain] })).toEqual({
      branch: 'INTERNAL_FREE',
      policy: {
        version: 2,
        branch: 'INTERNAL_FREE',
        chain: ['NEED', 'IT_ASSESSMENT', 'IT_EXECUTION'],
        slaWorkingDays: 2,
      },
      state: 'AWAITING_EXECUTION',
    });
  });
});

describe('completing the assessment of a plan the catalog lacks of software it has (case B, short: QĐ-111a)', () => {
  const planOnly = (over: Partial<AssessmentFields> = {}) => complete({ classification: null, ...over });
  const bare = (over: Partial<AssessmentFields> = {}): AssessmentFields => ({ ...empty, ...over });

  it('is complete with the plan alone: the name, the kind, the terms and the quote, nothing about the application', () => {
    const fields = bare({
      plannedPlanName: 'Business',
      provisioningType: 'K2',
      termsSummary: 'Annual terms',
      quote,
    });

    expect(judgeCompletion(fields, 'PLAN_ONLY')).toEqual({ kind: 'OK' });
    // The same fields lack the whole application when it is asked in full.
    expect(judgeCompletion({ ...fields, classification: 'PAID_LICENSED' }, 'FULL')).toMatchObject({
      kind: 'INCOMPLETE',
    });
  });

  it('names what the plan still lacks, in the order a screen shows it', () => {
    expect(judgeCompletion(bare(), 'PLAN_ONLY')).toEqual({
      kind: 'INCOMPLETE',
      missing: ['plannedPlanName', 'provisioningType', 'termsSummary', 'quote'],
    });
  });

  it('asks nothing of the application: no vendor, flags, methods, sensitivity, opinion, control level or classification', () => {
    expect(missingFields(planOnly({ vendorName: null, memberExport: null, sso: null }), 'PLAN_ONLY')).toEqual([]);
    expect(
      missingFields(planOnly({ dataSensitivity: 'HIGH', opinionStatus: null, controlLevel: null }), 'PLAN_ONLY'),
    ).toEqual([]);
    expect(judgeCompletion(planOnly({ classification: null }), 'PLAN_ONLY')).toEqual({ kind: 'OK' });
  });

  it('asks whether the plan has an admin console of the vendor for a K4 plan only (R-53)', () => {
    expect(missingFields(planOnly({ provisioningType: 'K4', adminConsole: null }), 'PLAN_ONLY')).toEqual([
      'adminConsole',
    ]);
    expect(missingFields(planOnly({ provisioningType: 'K4', adminConsole: false }), 'PLAN_ONLY')).toEqual([]);
    expect(missingFields(planOnly({ provisioningType: 'K2', adminConsole: null }), 'PLAN_ONLY')).toEqual([]);
  });

  it('is never completed as internal software, whatever the classification says: the application is already in the catalog', () => {
    expect(judgeCompletion(planOnly({ classification: 'INTERNAL' }), 'PLAN_ONLY')).toEqual({ kind: 'OK' });
  });

  it('still refuses at the gate a plan the IT Admin concluded cannot be controlled', () => {
    expect(judgeCompletion(planOnly({ controlLevel: 'UNCONTROLLABLE' }), 'PLAN_ONLY')).toEqual({
      kind: 'UNCONTROLLABLE',
    });
  });

  it('is not completed for a plan of internal software, whatever the IT Admin filled: its plans are free, so it would end paid and go to the spending approver (QĐ-111d, QĐ-103p, B2A-R3)', () => {
    expect(judgeCompletion(planOnly(), 'PLAN_ONLY', true)).toEqual({ kind: 'FREE_PLAN' });
    // Judged before what is missing and before the control level: nothing the IT Admin fills makes it completable.
    expect(judgeCompletion(bare(), 'PLAN_ONLY', true)).toEqual({ kind: 'FREE_PLAN' });
    expect(judgeCompletion(planOnly({ controlLevel: 'UNCONTROLLABLE' }), 'PLAN_ONLY', true)).toEqual({
      kind: 'FREE_PLAN',
    });
    expect(judgeCompletion(planOnly(), 'PLAN_ONLY', false)).toEqual({ kind: 'OK' });
  });

  it('leaves the whole assessment as it was: internal software there is the classification, completed by registering it', () => {
    expect(judgeCompletion(complete({ classification: 'INTERNAL' }), 'FULL', true)).toEqual({
      kind: 'INTERNAL_BY_REGISTRATION',
    });
    expect(judgeCompletion(complete(), 'FULL', true)).toEqual({ kind: 'OK' });
  });

  it('takes the short shape as the default of nothing: FULL stays what it was', () => {
    expect(judgeCompletion(complete())).toEqual(judgeCompletion(complete(), 'FULL'));
    expect(missingFields(empty)).toEqual(missingFields(empty, 'FULL'));
  });

  it('never registers internal software for a short proposal: its application is not new', () => {
    expect(
      internalRegistrationBasis({ classification: 'INTERNAL', dataSensitivity: 'LOW' }, 'LOW', 'PLAN_ONLY'),
    ).toEqual({
      kind: 'NOT_INTERNAL',
    });
  });
});

describe('the scope of the assessment of a proposal', () => {
  it('is the plan alone when the proposal names an application of the catalog, the whole otherwise', () => {
    expect(assessmentScopeOf({ existingApplicationId: 'app-1' })).toBe('PLAN_ONLY');
    expect(assessmentScopeOf({ existingApplicationId: null })).toBe('FULL');
  });
});

describe('QĐ-113a: the monthly price a quote gives the reference price of the plan', () => {
  const quoteOf = (amountMinor: bigint, billingCycle: Quote['billingCycle']): Quote => ({
    ...quote,
    unitPrice: { amountMinor, currency: 'VND' },
    billingCycle,
  });

  it('keeps a monthly quote as it is', () => {
    expect(monthlyPriceOfQuote(quoteOf(500_000n, 'MONTHLY'))).toEqual({ amountMinor: 500_000n, currency: 'VND' });
  });

  it('divides a quarterly quote by 3 and an annual one by 12', () => {
    expect(monthlyPriceOfQuote(quoteOf(1_500_000n, 'QUARTERLY')).amountMinor).toBe(500_000n);
    expect(monthlyPriceOfQuote(quoteOf(6_000_000n, 'ANNUAL')).amountMinor).toBe(500_000n);
  });

  it('rounds up to the dong', () => {
    expect(monthlyPriceOfQuote(quoteOf(1_000_000n, 'QUARTERLY')).amountMinor).toBe(333_334n);
    expect(monthlyPriceOfQuote(quoteOf(1_000_001n, 'ANNUAL')).amountMinor).toBe(83_334n);
    expect(monthlyPriceOfQuote(quoteOf(0n, 'ANNUAL')).amountMinor).toBe(0n);
  });
});
