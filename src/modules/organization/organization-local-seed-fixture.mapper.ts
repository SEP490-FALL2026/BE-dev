import type { CostCenterRecord } from './cost-center/cost-center.types';
import type { DepartmentRecord } from './department/department.types';
import type { DepartmentBrief, LocalSeedFixtureFacts } from './public/organization.types';

/** What another module needs to know of a department to point at it: its code, name and whether it and its Cost Center are active. */
export const toBrief = (
  record: { id: string; code: string; name: string; status: string; costCenter: { status: string } | null } | null,
): DepartmentBrief | null =>
  record && {
    id: record.id,
    code: record.code,
    name: record.name,
    active: record.status === 'ACTIVE',
    // No Cost Center in use (none yet, or only a retired one) counts as not active: nobody is placed there (`US-04-09` AC-3).
    costCenterActive: record.costCenter?.status === 'ACTIVE',
  };

/** The two local seed fixture items as `pnpm dev:seed` compares them; each is null when absent. */
export function toLocalSeedFixtureFacts(
  costCenter: CostCenterRecord | null,
  department: DepartmentRecord | null,
  costCenterDirectionActivated: boolean,
): LocalSeedFixtureFacts {
  return {
    costCenterDirectionActivated,
    costCenter: costCenter && {
      id: costCenter.id,
      code: costCenter.code,
      name: costCenter.name,
      kind: costCenter.kind,
      status: costCenter.status,
      departmentCode: costCenter.department?.code ?? null,
    },
    department: department && {
      id: department.id,
      code: department.code,
      name: department.name,
      status: department.status,
      costCenterId: department.costCenter?.id ?? null,
      costCenterCode: department.costCenter?.code ?? null,
    },
  };
}
