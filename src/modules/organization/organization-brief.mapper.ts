import type { DepartmentBrief } from './public/organization.types';

/** What another module needs to know of a department to point at it: its code, name and whether it and its Cost Center are active. */
export const toBrief = (
  record: {
    id: string;
    code: string;
    name: string;
    status: string;
    effectiveFrom: string;
    costCenter: { status: string } | null;
  } | null,
): DepartmentBrief | null =>
  record && {
    id: record.id,
    code: record.code,
    name: record.name,
    active: record.status === 'ACTIVE',
    effectiveFrom: record.effectiveFrom,
    // No Cost Center in use (none yet, or only a retired one) counts as not active: nobody is placed there (`US-04-09` AC-3).
    costCenterActive: record.costCenter?.status === 'ACTIVE',
  };
