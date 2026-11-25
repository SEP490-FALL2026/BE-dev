import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { LicensingSeatMonthApi } from '../../licensing/public/licensing-seat-month.api';
import type { SeatOfMonth } from '../../licensing/public/licensing-seat-month.types';
import type { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CommitmentRepo } from '../budget/commitment.repo';
import type { CommitmentMonthFacadeService } from '../commitment/commitment-month-facade.service';
import type { ThresholdAlertService } from '../threshold/threshold-alert.service';
import { SeatMonthSeatFactsService } from './seat-month-seat-facts.service';
import type { SeatMonthRepo } from './seat-month.repo';
import { SeatMonthSubscriptionService } from './seat-month-subscription.service';

const MONTH = '2026-01-01';
const SUBSCRIPTION = 'sub-1';
const tx = { marker: 'tx' } as unknown as DbTx;

const seat: SeatOfMonth = {
  assignmentId: 'a-1',
  subscriptionId: SUBSCRIPTION,
  planId: 'plan',
  employeeId: 'e-1',
  kind: 'PERSONAL',
  owningDepartmentId: null,
  heldFrom: '2025-12-01',
  heldUntil: null,
  requestId: 'r-1',
};

/**
 * One subscription and one month, in the transaction of the caller (`SM-1`): the seats of the subscription are read inside that transaction after the lock of the
 * month, a sweeper pass leaves alone a month some other pass marked while it waited for the lock, and a Cost Center whose commitment still waits for a budget is
 * never given its budget year to lock (exception E1 of `docs/rules/database-business.md`: the decision of a version takes the budget year first and then updates the waiting commitments).
 */
describe('SeatMonthSubscriptionService.charge', () => {
  /** A row of the month charged before, applied to the commitment `c-2` of the Cost Center `cc-2`, which no seat of the month points at any more. */
  const priorRowOfAnotherCommitment = {
    id: 'row-before',
    organizationId: 'org',
    subscriptionId: SUBSCRIPTION,
    assignmentId: 'a-gone',
    employeeId: 'e-gone',
    departmentId: 'd-2',
    costCenterId: 'cc-2',
    month: MONTH,
    days: 31,
    daysInMonth: 31,
    monthlyPriceMinor: 3_000_000n,
    amountMinor: 3_000_000n,
    commitmentId: 'c-2',
    appliedMinor: 3_000_000n,
    computedAt: new Date('2026-01-31T00:00:00Z'),
  };

  function build(
    options: {
      marked?: boolean;
      attachedVersionId?: string | null;
      priorAttachedVersionId?: string | null;
      slicesByCommitment?: Record<
        string,
        {
          commitmentId: string;
          month: string;
          seatCount: number;
          shareMinor: bigint;
          appliedMinor: bigint;
          releasedMinor: bigint;
          settledAt: Date | null;
        }[]
      >;
    } = {},
  ) {
    const calls: string[] = [];
    const watched: { costCenterId: string; year: number }[][] = [];
    const repo = {
      lockMonthOf: jest.fn(() => {
        calls.push('lockMonthOf');
        return Promise.resolve();
      }),
      isCharged: jest.fn(() => Promise.resolve(options.marked ?? false)),
      ofSubscriptionMonth: jest.fn(() =>
        Promise.resolve(options.priorAttachedVersionId === undefined ? [] : [priorRowOfAnotherCommitment]),
      ),
      deleteRows: jest.fn(() => Promise.resolve()),
      insertMany: jest.fn(() => Promise.resolve()),
      insertReversals: jest.fn(() => Promise.resolve()),
      markCharged: jest.fn(() => Promise.resolve()),
    };
    const licensing = {
      getSeatsOfMonth: jest.fn(() => {
        calls.push('getSeatsOfMonth');
        return Promise.resolve([seat]);
      }),
    };
    const commitments = {
      lockOfRequest: jest.fn(() =>
        Promise.resolve([
          {
            id: 'c-1',
            year: 2026,
            amountMinor: 100_000_000n,
            releasedMinor: 0n,
            appliedMinor: 0n,
            state: 'HELD',
            organizationId: 'org',
            costCenterId: 'cc-1',
            origin: 'APPROVAL',
            seatMonthlyMinor: 3_000_000n,
            attachedVersionId: options.attachedVersionId === undefined ? 'v-1' : options.attachedVersionId,
          },
        ]),
      ),
      lockById: jest.fn((_tx: unknown, id: string) =>
        Promise.resolve({
          id,
          requestId: id === 'c-2' ? 'r-gone' : 'r-1',
          year: 2026,
          amountMinor: 100_000_000n,
          releasedMinor: 0n,
          appliedMinor: id === 'c-2' ? 3_000_000n : 0n,
          currency: 'VND',
          state: 'HELD',
          organizationId: 'org',
          costCenterId: id === 'c-2' ? 'cc-2' : 'cc-1',
          attachedVersionId: id === 'c-2' ? options.priorAttachedVersionId || null : 'v-1',
        }),
      ),
      applyInvoice: jest.fn(() => Promise.resolve()),
      giveBackApplied: jest.fn(() => Promise.resolve()),
    };
    const commitmentMonths = {
      lockOfCommitment: jest.fn((_tx: unknown, commitmentId: string) =>
        Promise.resolve(options.slicesByCommitment?.[commitmentId] ?? []),
      ),
      addApplied: jest.fn(() => Promise.resolve()),
      reverseApplied: jest.fn(() => Promise.resolve()),
    };
    const thresholds = {
      watch: jest.fn((_tx: unknown, pairs: { costCenterId: string; year: number }[]) => {
        watched.push(pairs);
        return Promise.resolve({ pairs, usedBefore: new Map() });
      }),
      settle: jest.fn(() => Promise.resolve(0)),
    };
    const service = new SeatMonthSubscriptionService(
      repo as unknown as SeatMonthRepo,
      new SeatMonthSeatFactsService(
        licensing as unknown as LicensingSeatMonthApi,
        {
          getPlacementsBetween: () =>
            Promise.resolve([{ employeeId: 'e-1', departmentId: 'd-1', validFrom: '2025-01-01', validTo: null }]),
        } as unknown as OrganizationHistoryApi,
      ),
      {
        getOrganization: () => Promise.resolve({ id: 'org' }),
        getUnitCostCenterIds: () => Promise.resolve(new Map([['d-1', 'cc-1']])),
      } as unknown as OrganizationReadApi,
      {
        getPurchaseFacts: () => Promise.resolve([{ monthlyPriceMinor: 3_000_000n }]),
      } as unknown as SubscriptionPeriodApi,
      commitments as unknown as CommitmentRepo,
      commitmentMonths as unknown as CommitmentMonthFacadeService,
      { record: () => Promise.resolve() } as unknown as AuditApi,
      thresholds as unknown as ThresholdAlertService,
    );

    return { service, repo, licensing, commitments, commitmentMonths, calls, watched };
  }

  it('reads the seats of the subscription in the transaction of the charge, after the lock of the month', async () => {
    const { service, licensing, calls } = build();

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date('2026-02-01T00:00:00Z'));

    expect(calls).toEqual(['lockMonthOf', 'getSeatsOfMonth']);
    expect(licensing.getSeatsOfMonth).toHaveBeenCalledWith(MONTH, tx, SUBSCRIPTION);
  });

  it('leaves a month alone that has its mark once the lock is held, when the sweeper asks for the missing ones only', async () => {
    const { service, licensing, repo } = build({ marked: true });

    const rows = await service.charge(tx, SUBSCRIPTION, MONTH, new Date(), true);

    expect(rows).toBeNull();
    expect(repo.isCharged).toHaveBeenCalledWith(tx, SUBSCRIPTION, MONTH);
    expect(licensing.getSeatsOfMonth).not.toHaveBeenCalled();
    expect(repo.deleteRows).not.toHaveBeenCalled();
    expect(repo.insertMany).not.toHaveBeenCalled();
    expect(repo.markCharged).not.toHaveBeenCalled();
  });

  it('charges a month with no mark when the sweeper asks for the missing ones only', async () => {
    const { service, repo } = build({ marked: false });

    const rows = await service.charge(tx, SUBSCRIPTION, MONTH, new Date(), true);

    expect(rows).toBe(1);
    expect(repo.markCharged).toHaveBeenCalledTimes(1);
  });

  it('charges a month again that has its mark when it is charged on request', async () => {
    const { service, repo } = build({ marked: true });

    const rows = await service.charge(tx, SUBSCRIPTION, MONTH, new Date());

    expect(rows).toBe(1);
    expect(repo.isCharged).not.toHaveBeenCalled();
    expect(repo.markCharged).toHaveBeenCalledTimes(1);
  });

  it('takes the budget year of a Cost Center whose commitment is attached to a version, and watches its threshold', async () => {
    const { service, watched } = build({ attachedVersionId: 'v-1' });

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date());

    expect(watched).toEqual([[{ costCenterId: 'cc-1', year: 2026 }]]);
  });

  it('does not take the budget year of a Cost Center whose commitment still waits for a budget, nor watch its threshold', async () => {
    const { service, watched, repo } = build({ attachedVersionId: null });

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date());

    expect(watched).toEqual([[]]);
    expect(repo.insertMany).toHaveBeenCalledTimes(1);
  });

  it('does not take the budget year of the Cost Center of a commitment it locked by id, when that one still waits for a budget, nor watch its threshold', async () => {
    const { service, watched } = build({ priorAttachedVersionId: null });

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date());

    expect(watched.flat().map((pair) => pair.costCenterId)).not.toContain('cc-2');
    expect(watched.flat().map((pair) => pair.costCenterId)).toContain('cc-1');
  });

  it('takes the budget year of the Cost Center of a commitment it locked by id when that one is attached to a version', async () => {
    const { service, watched } = build({ priorAttachedVersionId: 'v-2' });

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date());

    expect(watched.flat().map((pair) => pair.costCenterId)).toContain('cc-2');
  });

  it('W3-07 Ca E & K: caps applied at monthly slice remaining via addApplied, and reverses slice applied via reverseApplied', async () => {
    const { service, commitments, commitmentMonths, repo } = build({
      priorAttachedVersionId: 'v-2',
      slicesByCommitment: {
        'c-1': [
          {
            commitmentId: 'c-1',
            month: MONTH,
            seatCount: 1,
            shareMinor: 500_000n,
            appliedMinor: 0n,
            releasedMinor: 0n,
            settledAt: null,
          },
        ],
        'c-2': [
          {
            commitmentId: 'c-2',
            month: MONTH,
            seatCount: 1,
            shareMinor: 3_000_000n,
            appliedMinor: 3_000_000n,
            releasedMinor: 0n,
            settledAt: new Date('2026-02-01T00:00:00Z'),
          },
        ],
      },
    });

    await service.charge(tx, SUBSCRIPTION, MONTH, new Date('2026-02-02T00:00:00Z'));

    const writtenRows = (repo.insertMany.mock.calls as unknown[][])[0][1] as unknown[];
    expect(writtenRows[0]).toMatchObject({
      amountMinor: 3_000_000n,
      appliedMinor: 500_000n,
    });
    expect(commitmentMonths.addApplied).toHaveBeenCalledWith(tx, 'c-1', MONTH, 500_000n);
    expect(commitments.applyInvoice).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'c-1' }), {
      takeMinor: 500_000n,
      stateAfter: 'HELD',
    });
    expect(commitmentMonths.reverseApplied).toHaveBeenCalledWith(tx, 'c-2', MONTH, 3_000_000n);
    expect(commitments.giveBackApplied).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'c-2' }), 3_000_000n);
  });
});
