/**
 * `pnpm ops:preflight` (P28-01, `P29-MIGRATION=B-FORWARD`): whether `prisma migrate deploy` can carry this database
 * through the merged migration `20261022120000_cost_centers_unit_only`, which stays byte for byte, and the forward
 * migration that brings every history to the rule of the application.
 */

/** The merged migration that moves Cost Centers to Units only; applied with this checksum on deployed databases. */
export const UNIT_ONLY_MIGRATION = '20261022120000_cost_centers_unit_only';
/** The forward migration: a service account is owned by its responsible person's department on its recorded day. */
export const FORWARD_MIGRATION = '20261023100000_service_account_owner_on_recorded_day';

/**
 * Where the database stands: no migration at all, before the merged migration, after it, after the forward migration,
 * or with one of the two recorded as failed by Prisma (a failed migration stops every later deploy).
 */
export type PreflightHistory =
  'NOT_INSTALLED' | 'BEFORE_UNIT_ONLY' | 'UNIT_ONLY_FAILED' | 'UNIT_ONLY_APPLIED' | 'FORWARD_FAILED' | 'CONVERGED';

/** What `_prisma_migrations` says about the two migrations (null: the table does not exist). */
export interface MigrationRecord {
  name: string;
  finished: boolean;
  rolledBack: boolean;
}

/** A service account as stored, with the department of its responsible person on the days that decide its owner. */
export interface ServiceAccountFacts {
  assignmentId: string;
  employeeCode: string;
  validFrom: string;
  /** The day it was recorded in the organization's calendar: `valid_from` when recorded, else the day it was written. */
  recordedOn: string;
  /** Before the merged migration: the department on `validFrom`, the day that migration reads. */
  startDepartment: string | null;
  /** After the merged migration: the owning department it stored. */
  storedDepartment: string | null;
  /** The department on `recordedOn`, the day the application reads (`QĐ-86c`). */
  recordedDepartment: string | null;
}

/** The facts of the data the two migrations convert. */
export interface ConversionFacts {
  serviceAccounts: ServiceAccountFacts[];
  /** Recorded cost allocation versions that give a share to a COMPANY Cost Center (history that never changes). */
  companyAllocations: Array<{ versionId: string; version: number; costCenter: string }>;
  /** Departments charged to a COMPANY Cost Center. */
  companyDepartments: Array<{ department: string; costCenter: string }>;
  /** The COMPANY Cost Centers the merged migration deletes. */
  companyCostCenters: Array<{ code: string; status: string }>;
}

export type PreflightBlocker =
  | { code: 'MIGRATION_FAILED'; migration: string }
  | { code: 'COST_ALLOCATION_NAMES_COMPANY'; versionId: string; version: number; costCenter: string }
  | { code: 'DEPARTMENT_CHARGED_TO_COMPANY'; department: string; costCenter: string }
  | {
      code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START';
      assignmentId: string;
      employeeCode: string;
      validFrom: string;
    }
  | {
      code: 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY';
      assignmentId: string;
      employeeCode: string;
      recordedOn: string;
    };

/** A service account the forward migration moves to its recorded-day department, with an Audit Trail record. */
export interface PreflightCorrection {
  assignmentId: string;
  recordedOn: string;
  fromDepartment: string;
  toDepartment: string;
}

export interface PreflightReport {
  /** READY: `migrate deploy` can run. BLOCKED: it must not; every blocker names its rows. */
  status: 'READY' | 'BLOCKED';
  history: PreflightHistory;
  blockers: PreflightBlocker[];
  corrections: PreflightCorrection[];
  companyCostCentersRemoved: Array<{ code: string; status: string }>;
}
