import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionReminderService } from './decision-reminder.service';
import { DecisionReturnService } from './decision-return.service';
import { DecisionRoutingService } from './decision-routing.service';
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
  workingDays: 5,
  nonWorking: new Set<string>(),
} as unknown as FollowUpDay;

const runner = { run: (fn: (tx: never) => unknown) => fn(TX) } as unknown as TransactionRunner;

const actingMap = (inCharge: string | null, substitute: string | null) =>
  new Map([
    [
      'dept-1',
      {
        inCharge,
        substitute,
        defaultAssignee: substitute ?? inCharge,
        actors: [inCharge, substitute].filter((x): x is string => x !== null),
      },
    ],
  ]);

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
        itAdminsActingFor: jest.fn().mockResolvedValue(actingMap(null, null)),
      } as never,
      { notifyInApp } as never,
      {} as never,
      {
        findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()),
        findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue(null),
      } as never,
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

describe('H18 acting IT Admin notification routing (substitute ?? inCharge, fallback Super Admin)', () => {
  it('routes GHOST_SEAT_ACTION_TIER to appointed substitute when active, else in-charge, else Super Admin', async () => {
    const makeRouting = (inCharge: string | null, substitute: string | null, superAdmin: string | null) => {
      const notifyInApp = jest.fn<
        Promise<void>,
        [unknown, { recipientEmployeeId: string; code: string; eventKey: string }]
      >();
      const actionRecord = { ...record, tier: 'ACTION' as const, state: 'OPEN' as const };
      const service = new DecisionRoutingService(
        runner,
        {} as never,
        { transition: jest.fn().mockResolvedValue(actionRecord) } as never,
        {
          getDepartmentHeads: jest.fn().mockResolvedValue(new Map([['dept-1', { employeeId: 'head' }]])),
          itAdminsActingFor: jest.fn().mockResolvedValue(actingMap(inCharge, substitute)),
        } as never,
        { notifyInApp } as never,
        {
          findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()),
          findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue(superAdmin),
        } as never,
      );
      return { service, notifyInApp, actionRecord };
    };

    const subCtx = makeRouting('it-incharge', 'it-sub', 'super-1');
    await subCtx.service.enterQueue(TX, subCtx.actionRecord, day, { departmentId: 'dept-1', returned: false });
    expect(subCtx.notifyInApp.mock.calls.map((c) => c[1])).toContainEqual(
      expect.objectContaining({
        recipientEmployeeId: 'it-sub',
        code: 'GHOST_SEAT_ACTION_TIER',
        eventKey: 'GHOST_SEAT_ACTION_TIER:it-sub:2026-W47',
      }),
    );

    const saCtx = makeRouting(null, null, 'super-1');
    await saCtx.service.enterQueue(TX, saCtx.actionRecord, day, { departmentId: 'dept-1', returned: false });
    expect(saCtx.notifyInApp.mock.calls.map((c) => c[1])).toContainEqual(
      expect.objectContaining({
        recipientEmployeeId: 'super-1',
        code: 'GHOST_SEAT_ACTION_TIER',
        eventKey: 'GHOST_SEAT_ACTION_TIER:super-1:2026-W47',
      }),
    );
  });

  it('routes GHOST_SEAT_DECISION_OVERDUE IT recipient to substitute ?? inCharge, falling back to Super Admin', async () => {
    const runOverdue = async (inCharge: string | null, substitute: string | null, superAdmin: string | null) => {
      const notifyInApp = jest.fn<
        Promise<void>,
        [unknown, { recipientEmployeeId: string; code: string; eventKey: string }]
      >();
      const service = new DecisionReminderService(
        runner,
        { ofStates: jest.fn().mockResolvedValue([record]), lockOrSkip: jest.fn().mockResolvedValue(record) } as never,
        {} as never,
        { markOverdueNoticed: jest.fn().mockResolvedValue(undefined) } as never,
        {
          getDepartmentHeads: jest.fn().mockResolvedValue(new Map([['dept-1', { employeeId: 'head' }]])),
          itAdminsActingFor: jest.fn().mockResolvedValue(actingMap(inCharge, substitute)),
        } as never,
        { notifyInApp } as never,
        {} as never,
        {
          findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()),
          findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue(superAdmin),
        } as never,
      );
      await service.noticeOverdue(day);
      return notifyInApp.mock.calls.map((c) => c[1]);
    };

    expect(await runOverdue('it-incharge', 'it-sub', 'super-1')).toEqual([
      expect.objectContaining({ recipientEmployeeId: 'head', code: 'GHOST_SEAT_DECISION_OVERDUE' }),
      expect.objectContaining({ recipientEmployeeId: 'it-sub', code: 'GHOST_SEAT_DECISION_OVERDUE' }),
    ]);
    expect(await runOverdue(null, null, 'super-1')).toEqual([
      expect.objectContaining({ recipientEmployeeId: 'head', code: 'GHOST_SEAT_DECISION_OVERDUE' }),
      expect.objectContaining({ recipientEmployeeId: 'super-1', code: 'GHOST_SEAT_DECISION_OVERDUE' }),
    ]);
  });
});
