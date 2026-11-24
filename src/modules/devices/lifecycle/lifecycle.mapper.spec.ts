import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceReturnTaskNotInChargeError } from './lifecycle.errors';
import { toLifecycleApiException } from './lifecycle.http-errors';
import { requireDepartmentActor, requireLifecycleActor, requireReturnTaskActor } from './lifecycle.mapper';

describe('lifecycle.mapper', () => {
  const tx = {} as DbTx;
  const today = '2026-11-24';

  function makeDeps(
    options: {
      workDepts?: Map<string, string>;
      notStartedIds?: string[];
      actingByDepartment?: Map<string, { inCharge: string | null; substitute: string | null; actors: string[] }>;
      unplacedDesignee?: { kind: 'DEVICE' | 'DEVICE_RETURN_TASK'; workId: string; designee: string | null };
    } = {},
  ) {
    const organizationReads = {
      workDepartmentsOf: jest.fn().mockResolvedValue(options.workDepts ?? new Map()),
      notStartedAmong: jest.fn().mockResolvedValue(new Set(options.notStartedIds ?? [])),
      itAdminsActingFor: jest.fn().mockResolvedValue(options.actingByDepartment ?? new Map()),
      itAdminsActingForUnplacedWork: jest
        .fn()
        .mockResolvedValue(
          options.unplacedDesignee
            ? new Map([
                [
                  unplacedWorkKey(options.unplacedDesignee.kind, options.unplacedDesignee.workId),
                  options.unplacedDesignee.designee,
                ],
              ])
            : new Map(),
        ),
    } as unknown as OrganizationReadApi;
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set()),
    } as unknown as IdentityAccessApi;

    return { organizationReads, identity };
  }

  describe('requireLifecycleActor', () => {
    it('returns false when both holder and recipient are null', async () => {
      const deps = makeDeps();
      await expect(
        requireLifecycleActor(tx, deps, {
          actorEmployeeId: 'it-1',
          today,
          oldHolderEmployeeId: null,
          recipientEmployeeId: null,
        }),
      ).resolves.toBe(false);
    });

    it('authorizes placed holder/recipient departments and rejects non-acting actors', async () => {
      const deps = makeDeps({
        workDepts: new Map([['emp-1', 'dept-1']]),
        actingByDepartment: new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub', actors: ['it-1', 'it-sub'] }],
        ]),
      });

      await expect(
        requireLifecycleActor(tx, deps, {
          actorEmployeeId: 'it-1',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).resolves.toBe(false);

      await expect(
        requireLifecycleActor(tx, deps, {
          actorEmployeeId: 'it-sub',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).resolves.toBe(true);

      await expect(
        requireLifecycleActor(tx, deps, {
          actorEmployeeId: 'it-other',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    });

    it('throws EmployeeNotStartedError before unplaced designation check and authorizes unplaced designee', async () => {
      const notStartedDeps = makeDeps({ notStartedIds: ['emp-1'] });
      await expect(
        requireLifecycleActor(tx, notStartedDeps, {
          actorEmployeeId: 'it-1',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).rejects.toBeInstanceOf(EmployeeNotStartedError);

      const unplacedDeps = makeDeps({
        unplacedDesignee: { kind: 'DEVICE', workId: 'dev-1', designee: 'it-des' },
      });
      await expect(
        requireLifecycleActor(tx, unplacedDeps, {
          actorEmployeeId: 'it-des',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).resolves.toBe(true);

      await expect(
        requireLifecycleActor(tx, unplacedDeps, {
          actorEmployeeId: 'it-other',
          today,
          deviceId: 'dev-1',
          oldHolderEmployeeId: 'emp-1',
          recipientEmployeeId: null,
        }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    });
  });

  describe('requireDepartmentActor', () => {
    it('rejects departing IT Admin in charge of their department with DeviceNotInChargeError while allowing appointed substitute', async () => {
      const deps = makeDeps({
        actingByDepartment: new Map([
          ['dept-1', { inCharge: 'it-departing', substitute: 'it-sub', actors: ['it-departing', 'it-sub'] }],
        ]),
      });

      const err = await requireDepartmentActor(tx, deps, {
        actorEmployeeId: 'it-departing',
        departmentId: 'dept-1',
        today,
        returnTaskId: 'task-1',
        returnTaskEmployeeId: 'it-departing',
      }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DeviceNotInChargeError);
      const mapped = toLifecycleApiException(err) as ApiException;
      expect(mapped.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(mapped.getResponse()).toMatchObject({ code: 'DEVICE.NOT_IN_CHARGE' });

      await expect(
        requireDepartmentActor(tx, deps, {
          actorEmployeeId: 'it-sub',
          departmentId: 'dept-1',
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'it-departing',
        }),
      ).resolves.toBe(true);
    });

    it('rejects departing substitute as well while allowing non-departing in-charge', async () => {
      const deps = makeDeps({
        actingByDepartment: new Map([
          ['dept-1', { inCharge: 'it-1', substitute: 'it-sub-departing', actors: ['it-1', 'it-sub-departing'] }],
        ]),
      });

      await expect(
        requireDepartmentActor(tx, deps, {
          actorEmployeeId: 'it-sub-departing',
          departmentId: 'dept-1',
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'it-sub-departing',
        }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);

      await expect(
        requireDepartmentActor(tx, deps, {
          actorEmployeeId: 'it-1',
          departmentId: 'dept-1',
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'it-sub-departing',
        }),
      ).resolves.toBe(false);
    });

    it('handles unplaced return task branch (not-started, departing exclusion, and DEVICE_RETURN_TASK designee)', async () => {
      const notStarted = makeDeps({ notStartedIds: ['emp-unplaced'] });
      await expect(
        requireDepartmentActor(tx, notStarted, {
          actorEmployeeId: 'it-des',
          departmentId: null,
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'emp-unplaced',
        }),
      ).rejects.toBeInstanceOf(EmployeeNotStartedError);

      const unplaced = makeDeps({
        unplacedDesignee: { kind: 'DEVICE_RETURN_TASK', workId: 'task-1', designee: 'it-des' },
      });
      await expect(
        requireDepartmentActor(tx, unplaced, {
          actorEmployeeId: 'it-des',
          departmentId: null,
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'it-des',
        }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);

      await expect(
        requireDepartmentActor(tx, unplaced, {
          actorEmployeeId: 'it-des',
          departmentId: null,
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'emp-unplaced',
        }),
      ).resolves.toBe(true);

      await expect(
        requireDepartmentActor(tx, unplaced, {
          actorEmployeeId: 'it-other',
          departmentId: null,
          today,
          returnTaskId: 'task-1',
          returnTaskEmployeeId: 'emp-unplaced',
        }),
      ).rejects.toBeInstanceOf(DeviceNotInChargeError);
    });
  });

  describe('requireReturnTaskActor', () => {
    it('rejects departing IT Admin with DeviceReturnTaskNotInChargeError and allows non-departing substitute or designee', async () => {
      const deptDeps = makeDeps({
        actingByDepartment: new Map([
          ['dept-1', { inCharge: 'it-departing', substitute: 'it-sub', actors: ['it-departing', 'it-sub'] }],
        ]),
      });

      const err = await requireReturnTaskActor(tx, deptDeps, {
        actorEmployeeId: 'it-departing',
        departmentId: 'dept-1',
        taskEmployeeId: 'it-departing',
        taskId: 'task-1',
        today,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DeviceReturnTaskNotInChargeError);
      const mapped = toLifecycleApiException(err) as ApiException;
      expect(mapped.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(mapped.getResponse()).toMatchObject({ code: 'DEVICE_RETURN_TASK.NOT_IN_CHARGE' });

      await expect(
        requireReturnTaskActor(tx, deptDeps, {
          actorEmployeeId: 'it-sub',
          departmentId: 'dept-1',
          taskEmployeeId: 'it-departing',
          taskId: 'task-1',
          today,
        }),
      ).resolves.toBe(true);

      const unplacedDeps = makeDeps({
        unplacedDesignee: { kind: 'DEVICE_RETURN_TASK', workId: 'task-1', designee: 'it-des' },
      });
      await expect(
        requireReturnTaskActor(tx, unplacedDeps, {
          actorEmployeeId: 'it-des',
          departmentId: null,
          taskEmployeeId: 'emp-1',
          taskId: 'task-1',
          today,
        }),
      ).resolves.toBe(true);
    });
  });
});
