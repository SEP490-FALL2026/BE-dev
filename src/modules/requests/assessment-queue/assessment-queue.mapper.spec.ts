import type { AssessmentFields } from '../access-request/assessment-record.types';
import { holderOf, queueItemOf, readinessOf, type QueueLookups } from './assessment-queue.mapper';
import type { AssessmentQueueRow } from './assessment-queue.repo';

const READER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const REQUESTER = '00000000-0000-4000-8000-000000000003';
const DEPARTMENT = '00000000-0000-4000-8000-0000000000d1';

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
const quote: NonNullable<AssessmentFields['quote']> = {
  unitPrice: { amountMinor: 800n, currency: 'USD' },
  billingCycle: 'MONTHLY',
  validFrom: '2026-01-01',
  validUntil: null,
};
const filled: AssessmentFields = {
  ...empty,
  classification: 'PAID_LICENSED',
  vendorName: 'Miro Inc',
  plannedPlanName: 'Team',
  provisioningType: 'K2',
  adminConsole: true,
  memberExport: true,
  sso: false,
  termsSummary: 'Annual',
  memberUsageMethod: 'Admin export',
  grantRevokeMethod: 'Invite by email',
  dataSensitivity: 'LOW',
  controlLevel: 'PARTIAL',
};

const lookups: QueueLookups = {
  people: new Map([
    [REQUESTER, { id: REQUESTER, employeeCode: 'E-1', fullName: 'Requester' }],
    [OTHER, { id: OTHER, employeeCode: 'IT-2', fullName: 'Other IT' }],
  ]),
  departments: new Map([[DEPARTMENT, { id: DEPARTMENT, name: 'Design' }]]),
};

const row = (over: Partial<AssessmentQueueRow> = {}): AssessmentQueueRow => ({
  requestId: '00000000-0000-4000-8000-0000000000a1',
  stepState: 'PENDING',
  assigneeEmployeeId: OTHER,
  waitingReason: null,
  slaWorkingDays: 2,
  reachedItAt: new Date('2026-10-01T03:00:00.000Z'),
  requesterEmployeeId: REQUESTER,
  departmentId: DEPARTMENT,
  readerIsParty: false,
  softwareName: 'Miro',
  expectedUsers: 5,
  started: false,
  fields: empty,
  ...over,
});

describe('the readiness of an assessment in the queue', () => {
  it('is incomplete with the count of what is lacking while nothing is classified', () => {
    expect(readinessOf(empty)).toEqual({ readiness: 'INCOMPLETE', missingCount: 1 });
  });

  it('counts every field the completion would name, the quote among them', () => {
    expect(readinessOf({ ...filled })).toEqual({ readiness: 'INCOMPLETE', missingCount: 1 });
    expect(readinessOf({ ...filled, controlLevel: null })).toEqual({ readiness: 'INCOMPLETE', missingCount: 2 });
  });

  it('can be completed once the minimum and a quote are there', () => {
    expect(readinessOf({ ...filled, quote })).toEqual({ readiness: 'COMPLETABLE', missingCount: 0 });
  });

  it('says that internal software is registered and that a tool that cannot be controlled is refused', () => {
    expect(readinessOf({ ...empty, classification: 'INTERNAL' })).toEqual({
      readiness: 'INTERNAL_BY_REGISTRATION',
      missingCount: 0,
    });
    expect(readinessOf({ ...filled, quote, controlLevel: 'UNCONTROLLABLE' })).toEqual({
      readiness: 'UNCONTROLLABLE',
      missingCount: 0,
    });
  });
});

describe('who holds the step, from the reader', () => {
  it('names the reader, another IT Admin, or nobody', () => {
    expect(holderOf(READER, READER)).toBe('YOU');
    expect(holderOf(OTHER, READER)).toBe('ANOTHER_IT_ADMIN');
    expect(holderOf(null, READER)).toBe('NOBODY');
  });
});

describe('a row of the queue as the wire shows it', () => {
  it('shows the software, the people, the department and the state without anything of the assessment text', () => {
    expect(queueItemOf(row({ fields: { ...filled, quote } }), READER, lookups)).toEqual({
      requestId: '00000000-0000-4000-8000-0000000000a1',
      software: { name: 'Miro', expectedUsers: 5 },
      requester: { employeeId: REQUESTER, employeeCode: 'E-1', fullName: 'Requester' },
      department: { id: DEPARTMENT, name: 'Design' },
      holder: 'ANOTHER_IT_ADMIN',
      assignee: { employeeId: OTHER, employeeCode: 'IT-2', fullName: 'Other IT' },
      waitingReason: null,
      canAct: true,
      started: false,
      classification: 'PAID_LICENSED',
      readiness: 'COMPLETABLE',
      missingCount: 0,
      quote: 'RECORDED',
      slaWorkingDays: 2,
      waitingSince: '2026-10-01T03:00:00.000Z',
    });
  });

  it('says nobody holds a waiting step, that no quote is recorded, and that a party to the request cannot act', () => {
    const item = queueItemOf(
      row({
        assigneeEmployeeId: null,
        stepState: 'WAITING',
        waitingReason: 'NO_IT_ADMIN_IN_CHARGE',
        readerIsParty: true,
      }),
      READER,
      lookups,
    );

    expect(item).toMatchObject({
      holder: 'NOBODY',
      assignee: null,
      waitingReason: 'NO_IT_ADMIN_IN_CHARGE',
      canAct: false,
      quote: 'MISSING',
    });
  });
});
