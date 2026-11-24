import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { unplacedWorkKey, type UsableItAdmins } from '../../organization/public/organization.types';
import { StopRequestNotifier, type StopRequestNoticeContext } from './stop-request-notifier.service';
import type { StopRequestRecord } from './stop-request.repo';

const CONTEXT: StopRequestNoticeContext = {
  organizationId: 'org-1',
  timeZone: 'Asia/Ho_Chi_Minh',
};

interface NoticeCall {
  organizationId: string;
  recipientEmployeeId: string;
  code: string;
  subject: { type: string; id: string };
  params: Record<string, unknown>;
  eventKey: string;
}

const makeRequest = (overrides: Partial<StopRequestRecord> = {}): StopRequestRecord => ({
  id: 'stop-1',
  registrationId: 'reg-1',
  deviceId: 'dev-1',
  holderEmployeeId: 'emp-holder',
  state: 'OPEN',
  invalidReason: null,
  requestedAt: new Date('2026-10-20T01:00:00.000Z'),
  dueAt: new Date('2026-10-22T01:00:00.000Z'),
  handledAt: null,
  handledByAppUserId: null,
  selfHandled: false,
  ...overrides,
});

function harness(options: {
  departmentId?: string | null;
  acting?: { actors: string[]; substitute: string | null } | undefined;
  unplacedDesignee?: string | null;
  superAdminId?: string | null;
  holderEmployeeId?: string;
}) {
  const tx = { tag: 'tx' } as unknown as DbTx;
  const holderEmployeeId = options.holderEmployeeId ?? 'emp-holder';
  const notifyInApp = jest.fn<Promise<boolean>, [DbTx, NoticeCall]>().mockResolvedValue(true);
  const deptMap =
    options.departmentId === undefined || options.departmentId === null
      ? new Map<string, string>()
      : new Map([[holderEmployeeId, options.departmentId]]);
  const actingMap =
    options.departmentId && options.acting ? new Map([[options.departmentId, options.acting]]) : new Map();
  const unplacedMap = new Map<string, string | null>([
    [unplacedWorkKey('DEVICE', 'dev-1'), options.unplacedDesignee ?? null],
  ]);

  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-10-21'),
    workDepartmentsOf: jest.fn().mockResolvedValue(deptMap),
    itAdminsActingFor: jest.fn().mockImplementation(async (_depts: string[], usableAmong: UsableItAdmins) => {
      await usableAmong(['emp-incharge']);
      return actingMap;
    }),
    itAdminsActingForUnplacedWork: jest.fn().mockResolvedValue(unplacedMap),
  };
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['emp-incharge'])),
    findUsableSuperAdminEmployeeId: jest
      .fn()
      .mockResolvedValue(options.superAdminId === undefined ? 'emp-sa' : options.superAdminId),
  };

  const notifier = new StopRequestNotifier({ notifyInApp } as never, organizationReads as never, identity as never);

  return { tx, notifier, notifyInApp, organizationReads, identity };
}

describe('StopRequestNotifier', () => {
  it('notifies usable in-charge IT Admin on requested()', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      departmentId: 'dept-1',
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    await notifier.requested(tx, CONTEXT, makeRequest());

    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      recipientEmployeeId: 'emp-incharge',
      code: 'DEVICE_STOP_REQUESTED',
      subject: { type: 'DEVICE_STOP_REQUEST', id: 'stop-1' },
      params: {
        stopRequestId: 'stop-1',
        registrationId: 'reg-1',
        deviceId: 'dev-1',
        holderEmployeeId: 'emp-holder',
        dueAt: '2026-10-22T01:00:00.000Z',
        dueOn: '2026-10-22',
      },
      eventKey: 'DEVICE_STOP_REQUESTED:stop-1',
    });
  });

  it('notifies both in-charge and substitute when both are usable', async () => {
    const { tx, notifier, notifyInApp } = harness({
      departmentId: 'dept-1',
      acting: { actors: ['emp-incharge', 'emp-sub'], substitute: 'emp-sub' },
    });

    await notifier.requested(tx, CONTEXT, makeRequest());

    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-incharge', 'emp-sub']);
  });

  it('notifies substitute alone when in-charge IT Admin is locked', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      departmentId: 'dept-1',
      acting: { actors: ['emp-sub'], substitute: 'emp-sub' },
    });

    await notifier.requested(tx, CONTEXT, makeRequest());

    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sub']);
  });

  it('excludes holder when holder is in-charge IT Admin and notifies substitute if present', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      departmentId: 'dept-1',
      holderEmployeeId: 'emp-incharge',
      acting: { actors: ['emp-incharge', 'emp-sub'], substitute: 'emp-sub' },
    });

    await notifier.requested(tx, CONTEXT, makeRequest({ holderEmployeeId: 'emp-incharge' }));

    expect(identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sub']);
  });

  it('falls back to Super Admin when holder is the only acting IT Admin in charge', async () => {
    const { tx, notifier, notifyInApp } = harness({
      departmentId: 'dept-1',
      holderEmployeeId: 'emp-incharge',
      acting: { actors: ['emp-incharge'], substitute: null },
      superAdminId: 'emp-sa',
    });

    await notifier.requested(tx, CONTEXT, makeRequest({ holderEmployeeId: 'emp-incharge' }));

    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies only Super Admin when in-charge is locked and no substitute exists', async () => {
    const { tx, notifier, notifyInApp, identity } = harness({
      departmentId: 'dept-1',
      acting: { actors: [], substitute: null },
      superAdminId: 'emp-sa',
    });

    await notifier.requested(tx, CONTEXT, makeRequest());

    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(tx);
    expect(notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);
  });

  it('notifies designated IT Admin for unplaced holder when a DEVICE designation exists, otherwise Super Admin', async () => {
    const designated = harness({ departmentId: null, unplacedDesignee: 'emp-designee', superAdminId: 'emp-sa' });
    await designated.notifier.requested(designated.tx, CONTEXT, makeRequest());
    expect(designated.identity.findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(designated.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-designee']);

    const first = harness({ departmentId: null, superAdminId: 'emp-sa' });
    await first.notifier.requested(first.tx, CONTEXT, makeRequest());
    expect(first.notifyInApp.mock.calls.map((c) => c[1].recipientEmployeeId)).toEqual(['emp-sa']);

    const self = harness({ departmentId: null, holderEmployeeId: 'emp-sa', superAdminId: 'emp-sa' });
    await self.notifier.requested(self.tx, CONTEXT, makeRequest({ holderEmployeeId: 'emp-sa' }));
    expect(self.notifyInApp).not.toHaveBeenCalled();
  });

  it('ignores non-OPEN state on requested() and sends DEVICE_STOP_REQUEST_OVERDUE on overdue()', async () => {
    const { tx, notifier, notifyInApp } = harness({
      departmentId: 'dept-1',
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    await notifier.requested(tx, CONTEXT, makeRequest({ state: 'INVALID', invalidReason: 'DUPLICATE' }));
    expect(notifyInApp).not.toHaveBeenCalled();

    await notifier.overdue(tx, CONTEXT, makeRequest());
    expect(notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifyInApp.mock.calls[0][1]).toMatchObject({
      recipientEmployeeId: 'emp-incharge',
      code: 'DEVICE_STOP_REQUEST_OVERDUE',
      eventKey: 'DEVICE_STOP_REQUEST_OVERDUE:stop-1',
    });
  });
});
