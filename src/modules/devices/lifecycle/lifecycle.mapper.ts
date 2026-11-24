import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotInChargeError } from '../public/devices.errors';
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
    oldHolderEmployeeId: string | null;
    recipientEmployeeId: string | null;
  },
): Promise<boolean> {
  const employeeIds = [input.oldHolderEmployeeId, input.recipientEmployeeId].filter((id): id is string => id !== null);
  if (employeeIds.length === 0) return false;

  const workDepts = await deps.organizationReads.workDepartmentsOf(employeeIds, input.today, tx);
  const holderDepartmentId = input.oldHolderEmployeeId ? (workDepts.get(input.oldHolderEmployeeId) ?? null) : null;
  const recipientDepartmentId = input.recipientEmployeeId ? (workDepts.get(input.recipientEmployeeId) ?? null) : null;

  if ((input.oldHolderEmployeeId && !holderDepartmentId) || (input.recipientEmployeeId && !recipientDepartmentId)) {
    const verdict = judgeDeviceActor({
      holderDepartmentId,
      recipientDepartmentId,
      actingByDepartment: new Map(),
      actor: input.actorEmployeeId,
      unplacedRequired: true,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  const departmentIds = [
    ...new Set([holderDepartmentId, recipientDepartmentId].filter((id): id is string => id !== null)),
  ];
  const actingByDepartment = await deps.organizationReads.itAdminsActingFor(
    departmentIds,
    (ids) => deps.identity.findUsableItAdminEmployeeIds(ids, tx),
    tx,
  );
  const verdict = judgeDeviceActor({
    holderDepartmentId,
    recipientDepartmentId,
    actingByDepartment,
    actor: input.actorEmployeeId,
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
  input: { actorEmployeeId: string; departmentId: string | null },
): Promise<boolean> {
  if (!input.departmentId) {
    const verdict = judgeDeviceActor({
      holderDepartmentId: null,
      recipientDepartmentId: null,
      actingByDepartment: new Map(),
      actor: input.actorEmployeeId,
      unplacedRequired: true,
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
