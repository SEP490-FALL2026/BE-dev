import type { RequestFacts, StatusEvent, StatusFacts } from '../../src/modules/requests/status/request-status.types';
import { NO_FACTS } from '../../src/modules/requests/status/request-status.types';

/** Ids that read as people in the specs of the projection: the same person is always the same constant. */
export const PEOPLE = {
  requester: 'a0000000-0000-4000-8000-000000000001',
  beneficiary: 'a0000000-0000-4000-8000-000000000002',
  head: 'a0000000-0000-4000-8000-000000000003',
  approver: 'a0000000-0000-4000-8000-000000000004',
  itAdmin: 'a0000000-0000-4000-8000-000000000005',
  finance: 'a0000000-0000-4000-8000-000000000006',
  superAdmin: 'a0000000-0000-4000-8000-000000000007',
  holder: 'a0000000-0000-4000-8000-000000000008',
  other: 'a0000000-0000-4000-8000-000000000009',
} as const;

export const REQUEST_ID = 'b0000000-0000-4000-8000-000000000001';
export const STEP_ID = 'b0000000-0000-4000-8000-000000000002';
export const RETURN_ID = 'b0000000-0000-4000-8000-000000000003';

/** A request of the requester for themselves. */
export function requestFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    id: REQUEST_ID,
    organizationId: 'c0000000-0000-4000-8000-000000000001',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    requesterEmployeeId: PEOPLE.requester,
    beneficiaryEmployeeIds: [PEOPLE.requester],
    departmentId: 'd0000000-0000-4000-8000-000000000001',
    withdrawnByEmployeeId: null,
    withdrawalReason: null,
    ...overrides,
  };
}

/** A request the head sent for somebody else: the head is the requester, the person it is for is another. */
export function delegatedFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return requestFacts({
    requesterEmployeeId: PEOPLE.head,
    beneficiaryEmployeeIds: [PEOPLE.beneficiary],
    ...overrides,
  });
}

export function facts(overrides: Partial<StatusFacts> = {}): StatusFacts {
  return { ...NO_FACTS, request: requestFacts(), ...overrides };
}

export function event(
  action: string,
  after: StatusEvent['after'] = {},
  overrides: Partial<StatusEvent> = {},
): StatusEvent {
  return {
    id: 'e0000000-0000-4000-8000-000000000001',
    organizationId: 'c0000000-0000-4000-8000-000000000001',
    action,
    resourceType: 'ACCESS_REQUEST',
    resourceId: REQUEST_ID,
    actorEmployeeId: null,
    after: { requestId: REQUEST_ID, ...after },
    ...overrides,
  };
}
