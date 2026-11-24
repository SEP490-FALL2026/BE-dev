import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { StopRequestCompletionService } from './stop-request-completion.service';
import * as errors from './stop-request.errors';
import { toStopRequestApiException } from './stop-request.http-errors';

const actorOf = (employeeId: string): AuthenticatedPrincipal => ({
  subject: `app-${employeeId}`,
  appUserId: `app-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
});

const REQUEST = {
  id: 'req-1',
  registrationId: 'reg-1',
  deviceId: 'dev-1',
  holderEmployeeId: 'emp-holder',
  state: 'OPEN' as const,
  invalidReason: null,
  requestedAt: new Date('2026-10-20T00:00:00Z'),
  dueAt: new Date('2026-10-22T00:00:00Z'),
  handledAt: null,
  handledByAppUserId: null,
  selfHandled: false,
};

function harness(options: {
  departmentId?: string | null;
  acting?: { actors: string[]; substitute: string | null } | undefined;
  holderEmployeeId?: string;
  unplacedDesignee?: string | null;
  notStartedIds?: string[];
}) {
  const holderEmployeeId = options.holderEmployeeId ?? 'emp-holder';
  const request = { ...REQUEST, holderEmployeeId };
  const tx = { tag: 'tx' };
  const runner = { run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(tx)) };
  const complete = jest
    .fn()
    .mockImplementation((_t, _id, input: { selfHandled: boolean }) =>
      Promise.resolve({ ...request, state: 'COMPLETED', selfHandled: input.selfHandled }),
    );
  const repo = { find: jest.fn().mockResolvedValue(request), complete };
  const registry = {
    lockRegistrationChain: jest.fn().mockResolvedValue({
      id: 'reg-1',
      deviceId: 'dev-1',
      holderEmployeeId,
      endedAt: null,
    }),
    setCollectionStopped: jest.fn(),
  };
  const deptMap =
    options.departmentId === undefined || options.departmentId === null
      ? new Map()
      : new Map([[holderEmployeeId, options.departmentId]]);
  const actingMap =
    options.departmentId && options.acting ? new Map([[options.departmentId, options.acting]]) : new Map();
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    businessToday: jest.fn().mockResolvedValue('2026-10-21'),
    workDepartmentsOf: jest.fn().mockResolvedValue(deptMap),
    notStartedAmong: jest.fn().mockResolvedValue(new Set(options.notStartedIds ?? [])),
    itAdminsActingFor: jest.fn().mockResolvedValue(actingMap),
    itAdminsActingForUnplacedWork: jest
      .fn()
      .mockResolvedValue(
        options.unplacedDesignee !== undefined
          ? new Map([[unplacedWorkKey('DEVICE', REQUEST.deviceId), options.unplacedDesignee]])
          : new Map(),
      ),
  };
  const record = jest.fn<void, [unknown, { after: Record<string, unknown> }]>();
  const audit = { record };
  const identity = { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['emp-it'])) };

  const service = new StopRequestCompletionService(
    repo as never,
    registry as never,
    organizationReads as never,
    audit as never,
    runner as never,
    identity as never,
  );

  return { service, record, complete };
}

describe('StopRequestCompletionService (acting IT Admin)', () => {
  it('throws DeviceStopRequestNotInChargeError when holder has no work department', async () => {
    const { service, complete } = harness({ departmentId: null });
    const NotInCharge = (errors as Record<string, unknown>).DeviceStopRequestNotInChargeError as new () => Error;

    expect(NotInCharge).toBeDefined();
    await expect(service.complete(actorOf('emp-it'), 'req-1')).rejects.toBeInstanceOf(NotInCharge);
    expect(complete).not.toHaveBeenCalled();
  });

  it('throws DeviceStopRequestNotInChargeError when caller is not an acting IT Admin of the holder department', async () => {
    const { service, complete } = harness({
      departmentId: 'dep-1',
      acting: { actors: ['emp-incharge'], substitute: null },
    });
    const NotInCharge = (errors as Record<string, unknown>).DeviceStopRequestNotInChargeError as new () => Error;

    expect(NotInCharge).toBeDefined();
    await expect(service.complete(actorOf('emp-other'), 'req-1')).rejects.toBeInstanceOf(NotInCharge);
    expect(complete).not.toHaveBeenCalled();
  });

  it('completes without bySubstitute when usable in-charge IT Admin handles the request', async () => {
    const { service, record } = harness({
      departmentId: 'dep-1',
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    await service.complete(actorOf('emp-incharge'), 'req-1');

    expect(record).toHaveBeenCalledTimes(1);
    const event = record.mock.calls[0][1];
    expect(event.after).toMatchObject({ state: 'COMPLETED', selfHandled: false });
    expect(event.after).not.toHaveProperty('bySubstitute');
  });

  it('completes with bySubstitute: true in audit after when appointed substitute handles the request', async () => {
    const { service, record } = harness({
      departmentId: 'dep-1',
      acting: { actors: ['emp-sub'], substitute: 'emp-sub' },
    });

    await service.complete(actorOf('emp-sub'), 'req-1');

    expect(record).toHaveBeenCalledTimes(1);
    const event = record.mock.calls[0][1];
    expect(event.after).toMatchObject({ state: 'COMPLETED', selfHandled: false, bySubstitute: true });
  });

  it('allows acting IT Admin who is also the holder and sets selfHandled: true', async () => {
    const { service, record } = harness({
      departmentId: 'dep-1',
      holderEmployeeId: 'emp-incharge',
      acting: { actors: ['emp-incharge'], substitute: null },
    });

    const result = await service.complete(actorOf('emp-incharge'), 'req-1');

    expect(result.selfHandled).toBe(true);
    const event = record.mock.calls[0][1];
    expect(event.after).toMatchObject({ state: 'COMPLETED', selfHandled: true });
  });

  it('allows designated IT Admin to complete a stop request on an unplaced holder device with bySubstitute: true', async () => {
    const { service, record } = harness({ departmentId: null, unplacedDesignee: 'emp-des' });

    await service.complete(actorOf('emp-des'), 'req-1');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][1].after).toMatchObject({
      state: 'COMPLETED',
      selfHandled: false,
      bySubstitute: true,
    });
  });

  it('rejects completing a stop request for a future-placed holder with EmployeeNotStartedError (409 EMPLOYEE.NOT_STARTED)', async () => {
    const { service } = harness({ departmentId: null, notStartedIds: ['emp-holder'] });
    const err = await service.complete(actorOf('emp-it'), 'req-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmployeeNotStartedError);
    const mapped = toStopRequestApiException(err) as ApiException;
    expect(mapped.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(mapped.getResponse()).toMatchObject({ code: 'EMPLOYEE.NOT_STARTED' });
  });
});
