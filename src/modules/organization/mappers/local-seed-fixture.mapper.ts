import type { CostCenterRecord } from '../cost-center/cost-center.types';
import type { DepartmentRecord } from '../department/department.types';
import type { JobTitleRecord } from '../job-title/job-title.types';
import type { LocalSeedFixtureFacts } from '../organization.types';

/** The three local seed fixture items as `pnpm dev:seed` compares them (P23-RV-01); each is null when absent. */
export function toLocalSeedFixtureFacts(
  costCenter: CostCenterRecord | null,
  department: DepartmentRecord | null,
  jobTitle: JobTitleRecord | null,
  normalizedJobTitleName: string,
): LocalSeedFixtureFacts {
  return {
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
      costCenterId: department.costCenter.id,
      costCenterCode: department.costCenter.code,
    },
    jobTitle: jobTitle && {
      id: jobTitle.id,
      name: jobTitle.name,
      // Found by this key, so it is the key itself.
      normalizedName: normalizedJobTitleName,
      status: jobTitle.status,
    },
  };
}
