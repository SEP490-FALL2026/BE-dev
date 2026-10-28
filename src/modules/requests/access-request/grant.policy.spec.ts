import { grantAnswerFor } from './grant.policy';
import type { AccessRequestState, ServiceAccountRecord } from './access-request.types';

const detail = (boundaryState: ServiceAccountRecord['boundaryState']): ServiceAccountRecord => ({
  purpose: 'Build bot of the pipeline',
  expectedIdentifier: 'ci-bot-2',
  responsibleEmployeeId: 'e5',
  boundaryState,
  boundaryReason: boundaryState === 'REJECTED' ? 'A shared mailbox' : null,
  boundaryDecidedByEmployeeId: boundaryState === 'PENDING' ? null : 'it1',
  boundaryDecidedAt: boundaryState === 'PENDING' ? null : new Date('2026-10-24T01:00:00Z'),
  boundarySelfExecuted: false,
});
const request = (state: AccessRequestState, serviceAccount: ServiceAccountRecord | null = null) => ({
  state,
  beneficiaryEmployeeIds: ['e5'],
  planId: 'plan-1' as string | null,
  expectedEndDate: null,
  departmentId: 'd-eng',
  costCenterId: 'cc-eng',
  serviceAccount,
});

describe('grantAnswerFor a request of a person (US-07-01 AC-3, AC-16)', () => {
  it('is grantable as a personal seat once every approval is taken', () => {
    expect(grantAnswerFor(request('AWAITING_EXECUTION'))).toEqual({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId: 'e5',
      planId: 'plan-1',
      departmentId: 'd-eng',
      expectedEndDate: null,
    });
  });

  it('is not in the catalog while software that was proposed has no plan', () => {
    expect(grantAnswerFor({ ...request('AWAITING_EXECUTION'), planId: null })).toEqual({ status: 'NOT_IN_CATALOG' });
  });

  it('is not approved enough while a step is open, and ended once the request is over', () => {
    for (const state of ['PENDING', 'AWAITING_SPEND_DECISION', 'AWAITING_FINANCE_REVIEW'] as const) {
      expect(grantAnswerFor(request(state))).toEqual({ status: 'NOT_APPROVED' });
    }
    for (const state of ['REJECTED', 'IT_REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED', 'WITHDRAWN'] as const) {
      expect(grantAnswerFor(request(state))).toEqual({ status: 'ENDED' });
    }
  });
});

describe('grantAnswerFor a request of a service account (US-05-21 AC-3)', () => {
  it('waits for the boundary: a request nobody has checked, or that was refused, is not grantable', () => {
    expect(grantAnswerFor(request('AWAITING_EXECUTION', detail('PENDING')))).toEqual({
      status: 'BOUNDARY_NOT_CHECKED',
    });
    expect(grantAnswerFor(request('AWAITING_EXECUTION', detail('REJECTED')))).toEqual({
      status: 'BOUNDARY_NOT_CHECKED',
    });
  });

  it('is grantable as a service seat once the boundary is accepted, to the person who answers for it', () => {
    expect(grantAnswerFor(request('AWAITING_EXECUTION', detail('ACCEPTED')))).toEqual({
      status: 'GRANTABLE',
      seat: 'SERVICE',
      employeeId: 'e5',
      planId: 'plan-1',
      expectedEndDate: null,
      serviceAccount: {
        purpose: 'Build bot of the pipeline',
        expectedIdentifier: 'ci-bot-2',
        departmentId: 'd-eng',
        costCenterId: 'cc-eng',
      },
    });
  });

  it('is judged by the state before the boundary: an open step is not approved, an ended request is ended', () => {
    expect(grantAnswerFor(request('AWAITING_SPEND_DECISION', detail('PENDING')))).toEqual({ status: 'NOT_APPROVED' });
    expect(grantAnswerFor(request('IT_REJECTED', detail('REJECTED')))).toEqual({ status: 'ENDED' });
    expect(grantAnswerFor(request('EXECUTING', detail('ACCEPTED')))).toEqual({ status: 'ENDED' });
  });
});

describe('grantAnswerFor a request for the renewal of a right (US-05-14)', () => {
  it('is never grantable: its approval writes the record that follows, so nothing is left for the IT Admin', () => {
    expect(grantAnswerFor({ ...request('AWAITING_EXECUTION'), type: 'RENEWAL' })).toEqual({ status: 'ENDED' });
    expect(grantAnswerFor({ ...request('AWAITING_SPEND_DECISION'), type: 'RENEWAL' })).toEqual({
      status: 'NOT_APPROVED',
    });
  });
});

describe('grantAnswerFor a request for a group (US-05-17 AC-6)', () => {
  const lines = [
    { employeeId: 'e1', state: 'APPROVED' as const, expectedEndDate: null },
    { employeeId: 'e2', state: 'APPROVED' as const, expectedEndDate: '2026-12-31' },
    { employeeId: 'e3', state: 'NEED_CONFIRMED' as const, expectedEndDate: null },
    { employeeId: 'e4', state: 'AWAITING_NEED' as const, expectedEndDate: null },
    { employeeId: 'e5', state: 'SPEND_REJECTED' as const, expectedEndDate: null },
    { employeeId: 'e6', state: 'COMPLETED' as const, expectedEndDate: null },
    { employeeId: 'e7', state: 'WITHDRAWN' as const, expectedEndDate: null },
  ];
  const group = (state: AccessRequestState = 'AWAITING_EXECUTION') => ({
    ...request(state),
    type: 'GROUP_GRANT' as const,
    beneficiaryEmployeeIds: lines.map((line) => line.employeeId),
    lines,
  });

  it('is grantable for the person of an approved line, as a personal seat that ends on their own day', () => {
    expect(grantAnswerFor(group(), 'e1')).toEqual({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId: 'e1',
      planId: 'plan-1',
      departmentId: 'd-eng',
      expectedEndDate: null,
    });
    expect(grantAnswerFor(group('EXECUTING'), 'e2')).toMatchObject({ employeeId: 'e2', expectedEndDate: '2026-12-31' });
  });

  it('asks which person it is for, since a group is granted one person at a time', () => {
    expect(grantAnswerFor(group())).toEqual({ status: 'BENEFICIARY_REQUIRED' });
  });

  it('is not approved enough for a line still being decided, and ended for every other state of a line', () => {
    expect(grantAnswerFor(group(), 'e3')).toEqual({ status: 'NOT_APPROVED' });
    expect(grantAnswerFor(group(), 'e4')).toEqual({ status: 'NOT_APPROVED' });
    for (const id of ['e5', 'e6', 'e7']) expect(grantAnswerFor(group(), id)).toEqual({ status: 'ENDED' });
  });

  it('does not know a person who is not a line of the request', () => {
    expect(grantAnswerFor(group(), 'x9')).toEqual({ status: 'NOT_FOUND' });
  });

  it('judges the line and not the state of the request: the request is a summary of its lines', () => {
    expect(grantAnswerFor(group('REJECTED'), 'e1')).toMatchObject({ status: 'GRANTABLE' });
  });

  it('ignores the person for a request for one person', () => {
    expect(grantAnswerFor(request('AWAITING_EXECUTION'), 'somebody-else')).toMatchObject({
      status: 'GRANTABLE',
      employeeId: 'e5',
    });
  });
});
