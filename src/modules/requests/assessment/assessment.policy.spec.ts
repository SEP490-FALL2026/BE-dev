import type { AssessmentFields, Quote } from '../access-request/assessment-record.types';
import {
  actsForAssignee,
  canLinkCatalogPlan,
  checkAssessor,
  internalRegistrationBasis,
  judgeCompletion,
  missingFields,
  registeredShapeOf,
} from './assessment.policy';

const quote: Quote = {
  unitPrice: { amountMinor: 800n, currency: 'USD' },
  billingCycle: 'MONTHLY',
  validFrom: '2026-10-01',
  validUntil: null,
  commitmentMonths: null,
  paymentFrequency: null,
  firstPaymentOn: null,
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
    it('needs the opinion of the Business Owner, or the word that there is none with its reason', () => {
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
  };

  it('an IT Admin who is not the sender may, while the request waits for the assessment', () => {
    expect(checkAssessor(facts)).toBeNull();
  });

  it('nobody assesses a request they asked or are given', () => {
    expect(checkAssessor({ ...facts, actorEmployeeId: 'e1' })).toBe('OWN_REQUEST');
    expect(checkAssessor({ ...facts, actorEmployeeId: 'e2', beneficiaryEmployeeIds: ['e2'] })).toBe('OWN_REQUEST');
  });

  it.each(['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION', 'AWAITING_EXECUTION', 'REJECTED'] as const)(
    'nobody changes it when the request is %s',
    (requestState) => {
      expect(checkAssessor({ ...facts, requestState })).toBe('NOT_AWAITING_ASSESSMENT');
    },
  );
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
        version: 1,
        branch: 'INTERNAL_FREE',
        chain: ['NEED', 'IT_ASSESSMENT', 'IT_EXECUTION'],
        slaWorkingDays: 2,
      },
      state: 'AWAITING_EXECUTION',
    });
  });
});
