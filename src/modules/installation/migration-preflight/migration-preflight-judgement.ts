import {
  ConversionFacts,
  FORWARD_MIGRATION,
  MigrationRecord,
  PreflightBlocker,
  PreflightCorrection,
  PreflightHistory,
  PreflightReport,
  UNIT_ONLY_MIGRATION,
} from './migration-preflight.types';

/** Where a database stands: an attempt rolled back (by `migrate resolve --rolled-back`) counts as not applied. */
export function historyOf(applied: readonly MigrationRecord[] | null): PreflightHistory {
  if (applied === null) return 'NOT_INSTALLED';
  const state = (name: string): 'APPLIED' | 'FAILED' | 'ABSENT' => {
    const rows = applied.filter((row) => row.name === name && !row.rolledBack);
    if (rows.some((row) => row.finished)) return 'APPLIED';

    return rows.length > 0 ? 'FAILED' : 'ABSENT';
  };
  const unitOnly = state(UNIT_ONLY_MIGRATION);
  if (unitOnly === 'FAILED') return 'UNIT_ONLY_FAILED';
  if (unitOnly === 'ABSENT') return 'BEFORE_UNIT_ONLY';
  const forward = state(FORWARD_MIGRATION);
  if (forward === 'FAILED') return 'FORWARD_FAILED';

  return forward === 'APPLIED' ? 'CONVERGED' : 'UNIT_ONLY_APPLIED';
}

/**
 * What `migrate deploy` would do to the data, judged before it runs. Before the merged migration (or after its failed
 * attempt, which left the old schema): that migration owns a service account by the department on its start day and
 * stops when there is none, and cannot delete a COMPANY Cost Center that a department or a recorded allocation still
 * names. Either side of it, the forward migration owns it by the department on its recorded day and stops when there is
 * none (`QĐ-86c`). A converged database has nothing left to convert.
 */
export function judgeConversion(history: PreflightHistory, facts: ConversionFacts): PreflightReport {
  const blockers: PreflightBlocker[] = [];
  const corrections: PreflightCorrection[] = [];
  const legacy = history === 'BEFORE_UNIT_ONLY' || history === 'UNIT_ONLY_FAILED';
  const converting = legacy || history === 'UNIT_ONLY_APPLIED' || history === 'FORWARD_FAILED';

  if (history === 'UNIT_ONLY_FAILED') blockers.push({ code: 'MIGRATION_FAILED', migration: UNIT_ONLY_MIGRATION });
  if (history === 'FORWARD_FAILED') blockers.push({ code: 'MIGRATION_FAILED', migration: FORWARD_MIGRATION });

  if (converting) {
    if (legacy) {
      for (const line of facts.companyAllocations) blockers.push({ code: 'COST_ALLOCATION_NAMES_COMPANY', ...line });
      for (const row of facts.companyDepartments) blockers.push({ code: 'DEPARTMENT_CHARGED_TO_COMPANY', ...row });
    }
    for (const account of facts.serviceAccounts) {
      const { assignmentId, employeeCode, validFrom, recordedOn } = account;
      const current = legacy ? account.startDepartment : account.storedDepartment;
      if (legacy && current === null) {
        blockers.push({ code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START', assignmentId, employeeCode, validFrom });
      }
      if (account.recordedDepartment === null) {
        blockers.push({
          code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY',
          assignmentId,
          employeeCode,
          recordedOn,
        });
      } else if (current !== null && current !== account.recordedDepartment) {
        corrections.push({
          assignmentId,
          recordedOn,
          fromDepartment: current,
          toDepartment: account.recordedDepartment,
        });
      }
    }
  }

  return {
    status: blockers.length === 0 ? 'READY' : 'BLOCKED',
    history,
    blockers: blockers.sort(byCodeThenRow),
    corrections: corrections.sort((a, b) => compare(a.assignmentId, b.assignmentId)),
    companyCostCentersRemoved: legacy ? [...facts.companyCostCenters].sort((a, b) => compare(a.code, b.code)) : [],
  };
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Blockers by code, then by the row they name, so a report reads the same on every run. */
function byCodeThenRow(a: PreflightBlocker, b: PreflightBlocker): number {
  return compare(a.code, b.code) || compare(rowOf(a), rowOf(b));
}

function rowOf(blocker: PreflightBlocker): string {
  switch (blocker.code) {
    case 'MIGRATION_FAILED':
      return blocker.migration;
    case 'COST_ALLOCATION_NAMES_COMPANY':
      return `${blocker.versionId} ${blocker.costCenter}`;
    case 'DEPARTMENT_CHARGED_TO_COMPANY':
      return blocker.department;
    default:
      return blocker.assignmentId;
  }
}
