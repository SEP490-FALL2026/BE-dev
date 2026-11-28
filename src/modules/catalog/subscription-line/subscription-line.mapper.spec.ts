import { HttpStatus } from '@nestjs/common';
import {
  SubscriptionLineClosedError,
  SubscriptionLineLiveTakenError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLinePeriodNotFoundError,
  SubscriptionLinePeriodStaleError,
  SubscriptionLineQuantityViaPurchaseError,
  SubscriptionLineStaleError,
} from './subscription-line.errors';
import { PlanApplicationRetiredError, PlanNotFoundError } from '../plan/plan.errors';
import { WorkspaceVendorMismatchError } from '../workspace/workspace.errors';
import { toSubscriptionLineApiException } from './subscription-line.http-errors';
import { toSeatChangeItem, toSubscriptionLineDetail } from './subscription-line.mapper';
import type { SubscriptionLineRecord } from './subscription-line.types';

describe('subscription-line mapper & http-errors', () => {
  const line: SubscriptionLineRecord = {
    id: 'line-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    workspaceId: 'ws-1',
    planId: 'plan-1',
    monthlyUnitPriceMinor: 375_000n,
    minimumSeats: 5,
    ledgerOpenedOn: '2026-11-01',
    renewedFromLineId: null,
    closedOn: null,
    closedReason: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };

  it('maps SubscriptionLineRecord to wire detail with formatted VND money', () => {
    expect(toSubscriptionLineDetail(line, { id: 'plan-1', name: 'FigJam' }, 5, 3)).toEqual({
      id: 'line-1',
      plan: { id: 'plan-1', name: 'FigJam' },
      monthlyUnitPrice: { amount: '375000', currency: 'VND' },
      minimumSeats: 5,
      seatsToday: 5,
      assignedToday: 3,
      freeToday: 2,
      closedOn: null,
      closedReason: null,
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('maps SeatChange row to wire item with nullable references', () => {
    const mapped = toSeatChangeItem(
      {
        id: 'chg-1',
        effectiveOn: '2026-11-01',
        delta: 5,
        reason: 'INITIAL',
        source: 'ADJUSTMENT',
        basis: 'NONE',
        requestId: null,
        beneficiaryEmployeeId: null,
        seatPurchase: null,
        note: null,
        outOfProcess: false,
        autoRecorded: false,
        recordedByEmployeeId: null,
        recordedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      new Map(),
    );

    expect(mapped).toEqual({
      id: 'chg-1',
      effectiveOn: '2026-11-01',
      delta: 5,
      reason: 'INITIAL',
      source: 'ADJUSTMENT',
      basis: 'NONE',
      request: null,
      beneficiary: null,
      seatPurchase: null,
      note: null,
      outOfProcess: false,
      autoRecorded: false,
      recordedBy: null,
      recordedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it.each([
    [new SubscriptionLineNotResponsibleError(), HttpStatus.FORBIDDEN, 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
    [new SubscriptionLineNotFoundError(), HttpStatus.NOT_FOUND, 'SUBSCRIPTION_LINE.NOT_FOUND'],
    [new SubscriptionLinePeriodNotFoundError(), HttpStatus.NOT_FOUND, 'SUBSCRIPTION.NOT_FOUND'],
    [
      new SubscriptionLineStaleError(new Date('2026-11-01T00:00:00.000Z')),
      HttpStatus.CONFLICT,
      'SUBSCRIPTION_LINE.STALE',
    ],
    [
      new SubscriptionLinePeriodStaleError(new Date('2026-11-01T00:00:00.000Z')),
      HttpStatus.CONFLICT,
      'SUBSCRIPTION.STALE',
    ],
    [new SubscriptionLineClosedError(), HttpStatus.CONFLICT, 'SUBSCRIPTION_LINE.CLOSED'],
    [new SubscriptionLineLiveTakenError(), HttpStatus.CONFLICT, 'SUBSCRIPTION.DUPLICATE_PLAN'],
    [
      new SubscriptionLineQuantityViaPurchaseError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE',
    ],
    [
      new WorkspaceVendorMismatchError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'SUBSCRIPTION_LINE.WORKSPACE_VENDOR_MISMATCH',
    ],
    [new PlanNotFoundError(), HttpStatus.UNPROCESSABLE_ENTITY, 'SUBSCRIPTION_LINE.PLAN_NOT_FOUND'],
    [new PlanApplicationRetiredError(), HttpStatus.UNPROCESSABLE_ENTITY, 'SUBSCRIPTION_LINE.APPLICATION_RETIRED'],
  ])('maps %p to HTTP %s (%s)', (domainError, expectedStatus, expectedCode) => {
    const apiError = toSubscriptionLineApiException(domainError) as {
      getStatus: () => number;
      getResponse: () => { code: string };
    };
    expect(apiError.getStatus()).toBe(expectedStatus);
    expect(apiError.getResponse().code).toBe(expectedCode);
  });
});
