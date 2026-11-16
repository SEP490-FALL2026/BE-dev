import { decisionItemOf } from './assessment-decisions.mapper';
import type { AssessmentDecisionRow } from './assessment-decisions.repo';
import type { QueueLookups } from './assessment-queue.mapper';

const REQUESTER = '00000000-0000-4000-8000-000000000003';
const DECIDER = '00000000-0000-4000-8000-000000000002';
const DEPARTMENT = '00000000-0000-4000-8000-0000000000d1';

const lookups: QueueLookups = {
  people: new Map([
    [REQUESTER, { id: REQUESTER, employeeCode: 'E-1', fullName: 'Requester' }],
    [DECIDER, { id: DECIDER, employeeCode: 'IT-2', fullName: 'IT Admin' }],
  ]),
  departments: new Map([[DEPARTMENT, { id: DEPARTMENT, name: 'Design' }]]),
};

const row = (over: Partial<AssessmentDecisionRow> = {}): AssessmentDecisionRow => ({
  requestId: '00000000-0000-4000-8000-0000000000a1',
  softwareName: 'Miro',
  requesterEmployeeId: REQUESTER,
  departmentId: DEPARTMENT,
  planOnly: false,
  result: 'COMPLETED',
  rejectionKind: null,
  reason: null,
  decidedByEmployeeId: DECIDER,
  decidedAt: new Date('2026-10-02T04:00:00.000Z'),
  ...over,
});

describe('a decided assessment as the list of decisions shows it', () => {
  it('shows who decided, when, how it ended and for which software, without a reason when it was completed', () => {
    expect(decisionItemOf(row(), lookups)).toEqual({
      requestId: '00000000-0000-4000-8000-0000000000a1',
      software: { name: 'Miro' },
      requester: { employeeId: REQUESTER, employeeCode: 'E-1', fullName: 'Requester' },
      department: { id: DEPARTMENT, name: 'Design' },
      scope: 'FULL',
      result: 'COMPLETED',
      rejectionKind: null,
      reason: null,
      decidedBy: { employeeId: DECIDER, employeeCode: 'IT-2', fullName: 'IT Admin' },
      decidedAt: '2026-10-02T04:00:00.000Z',
    });
  });

  it('gives the kind and the reason of a refusal at the gate', () => {
    expect(
      decisionItemOf(
        row({ result: 'REJECTED', rejectionKind: 'NOT_ELIGIBLE', reason: 'Stores data outside the company' }),
        lookups,
      ),
    ).toMatchObject({ result: 'REJECTED', rejectionKind: 'NOT_ELIGIBLE', reason: 'Stores data outside the company' });
  });

  it('says that only the plan was assessed when the proposal named an application of the catalog', () => {
    expect(decisionItemOf(row({ planOnly: true }), lookups).scope).toBe('PLAN_ONLY');
  });

  it('is a fault, not a blank, when a person or the department of a decision does not exist', () => {
    expect(() =>
      decisionItemOf(row({ decidedByEmployeeId: '00000000-0000-4000-8000-0000000000ff' }), lookups),
    ).toThrow();
    expect(() => decisionItemOf(row({ departmentId: '00000000-0000-4000-8000-0000000000fe' }), lookups)).toThrow();
  });
});
