import type {
  AccountStateKey,
  ActivationState,
  AppRole,
  AppUserStatus,
  ApprovalRoleKind,
} from '../../identity-access/identity-access.types';

/** `INSTALLED` exits 0; the other two exit 2 (the command contract, `pnpm ops:inspect --help`). */
export type InstallationStatus = 'INSTALLED' | 'INCOMPLETE' | 'NOT_INSTALLED';

/** What makes an installed organization `INCOMPLETE`. Missing heads or IT Admins are facts, not problems. */
export type InspectionProblem =
  | 'MIGRATIONS_PENDING'
  | 'MIGRATIONS_FAILED'
  | 'MIGRATIONS_UNKNOWN'
  | 'BOOTSTRAP_RECORDS_INCOMPLETE'
  | 'SUPER_ADMIN_MISSING'
  | 'SUPER_ADMIN_NOT_USABLE';

/** A row of `_prisma_migrations`, the table `prisma migrate deploy` keeps. */
export interface AppliedMigrationRow {
  name: string;
  finished: boolean;
  rolledBack: boolean;
}

export interface MigrationReport {
  committed: number;
  applied: number;
  pending: string[];
  failed: string[];
  unknown: string[];
}

/**
 * What `ops:inspect` reports. Counts, states and one masked email; no id, name, code, hash, token or setting.
 * Sections after `organization` are null when there is no installation to inspect.
 */
export interface InstallationInspection {
  status: InstallationStatus;
  problems: InspectionProblem[];
  migrations: MigrationReport;
  organization: { timeZone: string; reportingCurrency: string } | null;
  bootstrapRecords: { complete: boolean; mismatched: string[] } | null;
  superAdmin: {
    holders: number;
    status: AppUserStatus;
    activationState: ActivationState;
    maskedEmail: string;
  } | null;
  accounts: { total: number; byState: Record<AccountStateKey, number> } | null;
  directRoles: Record<AppRole, number> | null;
  approvalRoles: Record<ApprovalRoleKind, number> | null;
  departments: { active: number; withoutCurrentHead: number; withoutUsableItAdmin: number } | null;
}
