import type { EmployeeStatus, UnplacedWorkDesignationEndCause, UnplacedWorkKind } from '../public/organization.types';

export interface UnplacedWorkDesignationRecord {
  id: string;
  organizationId: string;
  workKind: UnplacedWorkKind;
  workId: string;
  employee: { id: string; fullName: string };
  designee: { id: string; fullName: string };
  designeeStatus: EmployeeStatus;
  reason: string;
  appointedAt: Date;
  appointedByAppUserId: string;
  endedAt: Date | null;
  endedByAppUserId: string | null;
  endCause: UnplacedWorkDesignationEndCause | null;
}

export interface UnplacedWorkDesignationView extends UnplacedWorkDesignationRecord {
  designeeUsable: boolean;
}

export function toUnplacedWorkDesignationWire(view: UnplacedWorkDesignationView) {
  return {
    id: view.id,
    workKind: view.workKind,
    workId: view.workId,
    employee: view.employee,
    designee: {
      id: view.designee.id,
      fullName: view.designee.fullName,
      usable: view.designeeUsable,
    },
    reason: view.reason,
    appointedAt: view.appointedAt.toISOString(),
    endedAt: view.endedAt ? view.endedAt.toISOString() : null,
    endCause: view.endCause,
  };
}
