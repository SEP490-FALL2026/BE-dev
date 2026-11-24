import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotInChargeError } from '../public/devices.errors';
import { DeviceReturnTaskNotInChargeError } from './lifecycle.errors';
import type { SoftwareRemovalInput } from './lifecycle.policy';

export type NormalizedSoftwareRemoval = {
  outcome: 'REMOVED' | 'NOT_REMOVABLE';
  note: string | null;
};

/** Normalizes optional removal notes into trimmed text or null for storage and audit. */
export function normalizeSoftwareRemoval(input: SoftwareRemovalInput): NormalizedSoftwareRemoval {
  const note = (input.note ?? '').trim();

  return { outcome: input.outcome, note: note.length > 0 ? note : null };
}

async function resolveUnplacedDeviceDesignee(
  tx: DbTx,
  deps: { organizationReads: OrganizationReadApi; identity: IdentityAccessApi },
  input: { deviceId?: string | undefined; employeeIds: readonly string[] },
): Promise<string | null> {
  if (!input.deviceId || input.employeeIds.length !== 1) return null;
  const resolved = await deps.organizationReads.itAdminsActingForUnplacedWork(
    [{ workKind: 'DEVICE', workId: input.deviceId, employeeId: input.employeeIds[0] }],
    (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
    tx,
  );

  return resolved.get(unplacedWorkKey('DEVICE', input.deviceId)) ?? null;
}

/**
 * Checks whether the acting IT Admin covers both the current holder department and recipient department
 * (when applicable), returning whether a substitute acting appointment authorized the action.
 */
export async function requireLifecycleActor(
  tx: DbTx,
  deps: { organizationReads: OrganizationReadApi; identity: IdentityAccessApi },
  input: {
    actorEmployeeId: string;
    today: string;
    deviceId?: string | undefined;
    oldHolderEmployeeId: string | null;
    recipientEmployeeId: string | null;
  },
): Promise<boolean> {
  const employeeIds = [input.oldHolderEmployeeId, input.recipientEmployeeId].filter((id): id is string => id !== null);
  if (employeeIds.length === 0) return false;

  const workDepts = await deps.organizationReads.workDepartmentsOf(employeeIds, input.today, tx);
  const holderDepartmentId = input.oldHolderEmployeeId ? (workDepts.get(input.oldHolderEmployeeId) ?? null) : null;
  const recipientDepartmentId = input.recipientEmployeeId ? (workDepts.get(input.recipientEmployeeId) ?? null) : null;

  const unplacedEmployeeIds = [...new Set(employeeIds.filter((id) => !workDepts.get(id)))];
  const unplacedRequired = unplacedEmployeeIds.length > 0;
  const unplacedDesignee = unplacedRequired
    ? await resolveUnplacedDeviceDesignee(tx, deps, { deviceId: input.deviceId, employeeIds: unplacedEmployeeIds })
    : null;

  const departmentIds = [
    ...new Set([holderDepartmentId, recipientDepartmentId].filter((id): id is string => id !== null)),
  ];
  const actingByDepartment =
    departmentIds.length > 0
      ? await deps.organizationReads.itAdminsActingFor(
          departmentIds,
          (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
          tx,
        )
      : new Map();
  const verdict = judgeDeviceActor({
    holderDepartmentId,
    recipientDepartmentId,
    actingByDepartment,
    actor: input.actorEmployeeId,
    ...(unplacedRequired ? { unplacedRequired: true, unplacedDesignee } : {}),
  });
  if (!verdict.allowed) throw new DeviceNotInChargeError();

  return verdict.bySubstitute;
}

/**
 * Checks acting IT Admin coverage when acting on a single department (such as an awaiting-return task),
 * returning whether a substitute acting appointment authorized the action.
 */
export async function requireDepartmentActor(
  tx: DbTx,
  deps: { organizationReads: OrganizationReadApi; identity: IdentityAccessApi },
  input: {
    actorEmployeeId: string;
    departmentId: string | null;
    returnTaskId?: string | null | undefined;
    returnTaskEmployeeId?: string | null | undefined;
  },
): Promise<boolean> {
  if (!input.departmentId) {
    let unplacedDesignee: string | null = null;
    if (input.returnTaskId && input.returnTaskEmployeeId && input.actorEmployeeId !== input.returnTaskEmployeeId) {
      const resolved = await deps.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: 'DEVICE_RETURN_TASK', workId: input.returnTaskId, employeeId: input.returnTaskEmployeeId }],
        (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      );
      unplacedDesignee = resolved.get(unplacedWorkKey('DEVICE_RETURN_TASK', input.returnTaskId)) ?? null;
    }
    const verdict = judgeDeviceActor({
      holderDepartmentId: null,
      recipientDepartmentId: null,
      actingByDepartment: new Map(),
      actor: input.actorEmployeeId,
      unplacedRequired: true,
      unplacedDesignee,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  const actingByDepartment = await deps.organizationReads.itAdminsActingFor(
    [input.departmentId],
    (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
    tx,
  );
  const verdict = judgeDeviceActor({
    holderDepartmentId: input.departmentId,
    recipientDepartmentId: null,
    actingByDepartment,
    actor: input.actorEmployeeId,
  });
  if (!verdict.allowed) throw new DeviceNotInChargeError();

  return verdict.bySubstitute;
}

/**
 * Verifies that an IT Admin is currently acting for the return task's department (excluding the departing employee)
 * and returns whether the authorization came through an active substitute appointment.
 */
export async function requireReturnTaskActor(
  tx: DbTx,
  deps: { organizationReads: OrganizationReadApi; identity: IdentityAccessApi },
  input: { actorEmployeeId: string; departmentId: string | null; taskEmployeeId: string; taskId?: string | undefined },
): Promise<boolean> {
  if (input.actorEmployeeId === input.taskEmployeeId) {
    throw new DeviceReturnTaskNotInChargeError();
  }
  if (!input.departmentId) {
    if (!input.taskId) throw new DeviceReturnTaskNotInChargeError();
    const resolved = await deps.organizationReads.itAdminsActingForUnplacedWork(
      [{ workKind: 'DEVICE_RETURN_TASK', workId: input.taskId, employeeId: input.taskEmployeeId }],
      (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const designee = resolved.get(unplacedWorkKey('DEVICE_RETURN_TASK', input.taskId)) ?? null;
    if (designee !== input.actorEmployeeId) throw new DeviceReturnTaskNotInChargeError();

    return true;
  }

  const actingByDept = await deps.organizationReads.itAdminsActingFor(
    [input.departmentId],
    (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
    tx,
  );
  const acting = actingByDept.get(input.departmentId);
  const eligible = (acting?.actors ?? []).filter((id) => id !== input.taskEmployeeId);
  if (!acting || !eligible.includes(input.actorEmployeeId)) {
    throw new DeviceReturnTaskNotInChargeError();
  }

  return acting.substitute === input.actorEmployeeId && acting.inCharge !== input.actorEmployeeId;
}
