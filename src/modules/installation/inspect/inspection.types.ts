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
  | 'CHANGE_ANNOUNCEMENTS_MISSING'
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

/** The changes of the organization that are told once to the modules that act on them (`FR-3.16`); the three a seed can miss. */
export type ChangeAnnouncementKind = 'PLACEMENT_START' | 'HEAD_PERIOD_START' | 'HEAD_PERIOD_END';

/** How many changes of each kind took effect and no announcement marks (F47). */
export type ChangeAnnouncementGaps = Record<ChangeAnnouncementKind, number>;

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
  /**
   * F47: the placements and head periods that had taken effect in their organization's calendar when the migration that
   * seeded the announcements finished, and that nothing marks as told. 0 everywhere after `…_change_announcements_zone_…`.
   */
  changeAnnouncements: { complete: boolean; missing: ChangeAnnouncementGaps } | null;
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
