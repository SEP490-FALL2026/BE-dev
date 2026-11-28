import type { DepartmentItSubstituteEndCause } from '../../../generated/prisma/client';

export interface DepartmentItSubstituteRecord {
  id: string;
  organizationId: string;
  department: { id: string; name: string };
  substitute: { id: string; fullName: string };
  replaced: { id: string; fullName: string } | null;
  reason: string;
  appointedAt: Date;
  appointedByAppUserId: string;
  endedAt: Date | null;
  endedByAppUserId: string | null;
  endCause: DepartmentItSubstituteEndCause | null;
}

export interface DepartmentItSubstituteView extends DepartmentItSubstituteRecord {
  substituteUsable: boolean;
}

export function toDepartmentItSubstituteWire(view: DepartmentItSubstituteView) {
  return {
    id: view.id,
    department: view.department,
    substitute: {
      id: view.substitute.id,
      fullName: view.substitute.fullName,
      usable: view.substituteUsable,
    },
    replaced: view.replaced,
    reason: view.reason,
    appointedAt: view.appointedAt.toISOString(),
    endedAt: view.endedAt ? view.endedAt.toISOString() : null,
    endCause: view.endCause,
  };
}
