import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { RequesterHeadConversionService } from './requester-head-conversion.service';

describe('RequesterHeadConversionService', () => {
  const tx = { kind: 'tx' } as never;
  const request = { id: 'req-1', organizationId: 'org-1' };
  const actor = { appUserId: 'u-1', sessionId: 's-1', roles: ['EMPLOYEE'] } as unknown as AuthenticatedPrincipal;
  const step = {
    id: 'step-1',
    assigneeEmployeeId: 'old-head',
    waitingReason: null,
    createdAt: new Date('2026-11-20T03:00:00Z'),
  };

  function build() {
    const requests = { markOneStep: jest.fn(() => Promise.resolve()) };
    const audit = { record: jest.fn(() => Promise.resolve()) };

    return { service: new RequesterHeadConversionService(requests as never, audit as never), requests, audit };
  }

  const eventOf = (audit: { record: jest.Mock }) =>
    (audit.record.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];

  it('marks the request one-step for its requester and records, as the person, an event about the request when no step is named', async () => {
    const { service, requests, audit } = build();

    await service.convert(tx, request, { kind: 'USER', actor, trigger: 'ASSESSMENT_COMPLETED' });

    expect(requests.markOneStep).toHaveBeenCalledWith(tx, 'req-1', 'REQUESTER_IS_HEAD');
    expect(eventOf(audit)).toMatchObject({
      actorKind: 'USER',
      action: 'ACCESS_REQUEST.STEP_NOT_REQUIRED',
      resourceType: 'ACCESS_REQUEST',
      resourceId: 'req-1',
      after: {
        requestId: 'req-1',
        stepKind: 'NEED',
        trigger: 'ASSESSMENT_COMPLETED',
        oneStepReason: 'REQUESTER_IS_HEAD',
        requesterBecameHead: true,
      },
    });
  });

  it('records, as the system, an event about the need step with where it came from and who held it, and the ticket of an operator when there is one', async () => {
    const { service, audit } = build();

    await service.convert(
      tx,
      request,
      {
        kind: 'SYSTEM',
        trigger: 'HEAD_CHANGED',
        correlationId: 'corr-1',
        operator: { ticketId: 't-1', ticketRef: 'TKT-1' },
      },
      step,
    );

    expect(eventOf(audit)).toMatchObject({
      actorKind: 'OPERATOR',
      operatorReference: 'TKT-1',
      resourceType: 'ACCESS_REQUEST_STEP',
      resourceId: 'step-1',
      before: { assigneeEmployeeId: 'old-head', waitingReason: null },
      correlationId: 'corr-1',
      after: {
        trigger: 'HEAD_CHANGED',
        source: 'corr-1',
        oneStepReason: 'REQUESTER_IS_HEAD',
        requesterBecameHead: true,
        stepCreatedAt: '2026-11-20T03:00:00.000Z',
      },
    });
  });

  it('records the end of a need step for a department with no head without saying that a requester became head, and marks nothing', async () => {
    const { service, requests, audit } = build();

    await service.record(tx, request, {
      cause: { kind: 'SYSTEM', trigger: 'HEAD_CHANGED', correlationId: 'corr-2' },
      oneStepReason: 'NO_DEPARTMENT_HEAD',
      needStep: step,
    });

    expect(requests.markOneStep).not.toHaveBeenCalled();
    const { after } = eventOf(audit) as { after: Record<string, unknown> };
    expect(after).toMatchObject({ oneStepReason: 'NO_DEPARTMENT_HEAD' });
    expect(after).not.toHaveProperty('requesterBecameHead');
  });
});
