import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionReminderService } from './decision-reminder.service';
import { DecisionReturnService } from './decision-return.service';
import type { FollowUpDay } from './decision.types';

/**
 * A seat with no holder (A8 #15): the notices of the three ghost-seat codes carry `employeeId: null`, never `''`, so the
 * optional group "[ of {employeeId:name}]" of the sentence drops out and the wire says the holder is absent.
 */
const TX = { tx: true } as never;
const record = {
  id: 'rec-1',
  organizationId: 'org-1',
  applicationId: 'app-1',
  employeeId: null,
  deciderDepartmentId: 'dept-1',
  decisionDueOn: '2026-11-02',
  overdueNoticedAt: null,
  state: 'AWAITING_DECISION',
} as unknown as GhostSeatRecord;
const day = {
  organizationId: 'org-1',
  today: '2026-11-17',
  now: new Date('2026-11-17T03:00:00Z'),
  nonWorking: new Set<string>(),
} as unknown as FollowUpDay;

const runner = { run: (fn: (tx: never) => unknown) => fn(TX) } as unknown as TransactionRunner;

describe('the ghost-seat notices of a seat with no holder', () => {
  it('GHOST_SEAT_DECISION_OVERDUE carries employeeId null', async () => {
    const notifyInApp = jest.fn<Promise<void>, [unknown, { params: unknown }]>();
    const service = new DecisionReminderService(
      runner,
      { ofStates: jest.fn().mockResolvedValue([record]), lockOrSkip: jest.fn().mockResolvedValue(record) } as never,
      {} as never,
      { markOverdueNoticed: jest.fn().mockResolvedValue(undefined) } as never,
      {
        getDepartmentHeads: jest.fn().mockResolvedValue(new Map([['dept-1', { employeeId: 'head' }]])),
        getItAdminInChargeOfDepartment: jest.fn().mockResolvedValue(null),
      } as never,
      { notifyInApp } as never,
      {} as never,
    );

    expect(await service.noticeOverdue(day)).toBe(1);

    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp.mock.calls[0][1]).toMatchObject({
      code: 'GHOST_SEAT_DECISION_OVERDUE',
      params: { recommendationId: 'rec-1', employeeId: null, applicationId: 'app-1' },
    });
  });

  it('GHOST_SEAT_EXEMPTION_ENDING carries employeeId null', async () => {
    const notifyInApp = jest.fn<Promise<void>, [unknown, { params: unknown }]>();
    const service = new DecisionReminderService(
      runner,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { notifyInApp } as never,
      {} as never,
    );
    const tellEnding = (service as unknown as Record<'tellEnding', (...args: unknown[]) => Promise<void>>).tellEnding;

    await tellEnding.call(service, TX, record, { id: 'ex-1', exemptUntil: '2026-11-20' }, day, {
      departmentId: 'dept-1',
      headEmployeeId: 'head',
    });

    expect(notifyInApp.mock.calls[0][1]).toMatchObject({
      code: 'GHOST_SEAT_EXEMPTION_ENDING',
      params: { employeeId: null, exemptUntil: '2026-11-20' },
    });
  });

  it('GHOST_SEAT_RETURNED carries employeeId null, to the head and to the department that has none', async () => {
    const notifyInApp = jest.fn<Promise<void>, [unknown, { params: unknown }]>();
    const holdForDepartment = jest.fn<Promise<void>, [unknown, { params: unknown }]>();
    const service = new DecisionReturnService(
      runner,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { notifyInApp, holdForDepartment } as never,
      {} as never,
    );
    const tell = (service as unknown as Record<'tell', (...args: unknown[]) => Promise<void>>).tell;

    await tell.call(service, TX, record, 'org-1', 'head');
    await tell.call(service, TX, record, 'org-1', null);

    expect(notifyInApp.mock.calls[0][1].params).toEqual({
      recommendationId: 'rec-1',
      employeeId: null,
      applicationId: 'app-1',
    });
    expect(holdForDepartment.mock.calls[0][1].params).toMatchObject({ employeeId: null });
  });
});
