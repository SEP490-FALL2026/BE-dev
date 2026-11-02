/**
 * `pnpm ops:preflight` : whether `prisma migrate deploy` can carry this database
 * through the merged migration `20261022120000_cost_centers_unit_only`, which stays byte for byte, and the forward
 * migration that brings every history to the rule of the application. In the final release of
 * `g0-g6-final-business-baseline-remediation` it also judges the contract gates: the expansion of the
 * compatibility release, the data an operator assigns or links, and the rows of the kinds that are gone must be in place before
 * the migrations of this release run, and each one that is not is a blocker.
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

/**
 * Whether the database has the two objects of the owner-department expansion (`…_subscription_owner_column`): the
 * `subscriptions.owner_department_id` column and the `subscription_owner_assignments` table. `ABSENT`: neither (the
 * database is before the expansion: it blocks when it holds a subscription). `READY`: both (the compatibility schema and the
 * final one). `PARTIAL`: one without the other, which no migration of this repository produces. `NO_TABLE`: there is no
 * `subscriptions` table at all (an empty database).
 */
export type SubscriptionOwnerSchema = 'NO_TABLE' | 'ABSENT' | 'READY' | 'PARTIAL';

/**
 * Whether the database has the objects of the Cost Center link (`…_cost_center_department_link`): the
 * `cost_centers.department_id` column and the two tables of the record of a link and of the activation. `ABSENT`: none of
 * them (before the compatibility migration: it blocks when it holds an organization). `READY`: all (the compatibility schema
 * and the final one, which keeps both tables). `PARTIAL`: some, which no migration of this repository produces. `NO_TABLE`:
 * there is no `cost_centers` table at all (an empty database).
 */
export type CostCenterDirectionSchema = 'NO_TABLE' | 'ABSENT' | 'READY' | 'PARTIAL';

/**
 * What the contract gates read: the data the release after this one needs in its final shape. The facts are
 * read in the schema the database has **now**, after a probe — a gate never names an object the schema may not have.
 */
export interface ContractGateFacts {
  subscriptionOwner: {
    schema: SubscriptionOwnerSchema;
    /**
     * `ABSENT`: every subscription (the database skipped the expansion: each is a reason to stop). `READY`: the subscriptions
     * that still have none — no owner department and no valid assignment, or an assignment that conflicts with the owner
     * department (_dòng gán hợp lệ_); none once the final migration made the column required. Empty for the
     * other schemas.
     */
    subscriptionIds: string[];
  };
  /** Every Cost Center belongs to exactly one department (`QĐ-87d(1)`). */
  costCenterDirection: {
    schema: CostCenterDirectionSchema;
    /** `ABSENT`: the organizations of the database (it skipped the compatibility release: each is a reason to stop). */
    organizationIds: string[];
    /**
     * The three lists below are read only while the old column `departments.cost_center_id` still exists, that is until the
     * final migration of the Cost Center link has run: from then on the schema itself requires the link and no activation row is read
     * (the final installation writes none), so nothing about the direction can be open and they stay empty.
     * `READY`: every Cost Center with no department — the rows `7c28e75` wrote, **including the ones it writes after the
     * migration or after a recovery**.
     */
    costCenterIds: string[];
    /** `READY`: a department whose own column names a Cost Center that belongs to another department (the sync triggers prevent it). */
    mismatches: Array<{ costCenterId: string; departmentId: string }>;
    /** `READY`: the organizations whose link has not been activated by the operator (the final migration of the Cost Center link refuses them). */
    notActivated: string[];
  };
  /** The waiting rows of the kinds that are gone: the migration of the release after this one refuses to run over them. */
  retiredKinds: RetiredKindFacts;
  /** The proposals `7c28e75` gave back because their first version was refused. */
  legacyReturns: LegacyReturnFacts;
}

/**
 * What the judgement of J.2 reads. A candidate is a proposal given back (`RETURNED`) that has at least one refusal on a version made
 * from it: `7c28e75` wrote the refusal and the return in one transaction. `traced` is true when it has exactly one refusal, on a
 * `INITIAL` version in the state `REJECTED`, whose decider, reason and moment are the ones the return carries. Ids and flags only: no
 * reason, no amount and no name is read into the report.
 */
export interface LegacyReturnFacts {
  candidates: Array<{ proposalId: string; versionIds: string[]; decisionIds: string[]; traced: boolean }>;
  /**
   * The other proposals of the same Cost Center and year that were sent after the candidate was given back (`submittedAfter`) or that
   * send it again (`previousProposalId` is the candidate), with the proposal each one corrects.
   */
  neighbours: Array<{ proposalId: string; id: string; previousProposalId: string | null; submittedAfter: boolean }>;
}

/** The rows of the kinds the release after this one no longer takes (`QĐ-87e`): nothing is inferred from them. */
export interface RetiredKindFacts {
  /** A notice of a head about a change of job title that still waits for the IT Admin (`BM-09`). */
  pendingNoticeIds: string[];
  /** A transfer that changes the job title only (the department stays) and still waits for its day. */
  pendingTransferIds: string[];
  /** A proposal to move a service account to another department that still waits for the receiving head (`QĐ-89c`). */
  pendingMoveIds: string[];
}

/**
 * The people `QĐ-93k(4)` stops the conversion of `MANAGER` and `SPENDING_APPROVER` to granted roles for
 * (`…_identity_direct_roles`). Read, only while that migration is not applied, in the schema the database has now: the spending
 * approver is the open row of `approval_role_holders`, never a value the new enum has. Codes of people and departments only.
 */
export interface DirectRoleFacts {
  /** A head of a department today or later who has no account: no `MANAGER` can be granted to them. */
  headsWithoutAccount: Array<{ employeeCode: string; department: string }>;
  /** The spending approver heads a department today or later (`QĐ-93b`: never both). */
  spendingApproverHeads: Array<{ employeeCode: string; department: string }>;
  /** The spending approver also holds a role that cannot go with it. */
  spendingApproverHoldsRoles: Array<{ employeeCode: string; role: 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE' }>;
  /** The spending approver has no account to carry the grant. A locked, not activated or handing-over one does not stop it. */
  spendingApproverWithoutAccount: Array<{ employeeCode: string }>;
}

/** A row that needs attention later but does not stop the deploy. Ids only: no name, no amount, no basis. */
export type PreflightInformation = {
  code: 'BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE';
  proposalId: string;
  rule: 'R1' | 'R2';
};

export type PreflightBlocker =
  | { code: 'MIGRATION_FAILED'; migration: string }
  | { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT'; employeeCode: string; department: string }
  | { code: 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD'; employeeCode: string; department: string }
  | {
      code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE';
      employeeCode: string;
      role: 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE';
    }
  | { code: 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT'; employeeCode: string }
  | { code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED'; subscriptionId: string }
  | { code: 'SUBSCRIPTION_OWNER_UNASSIGNED'; subscriptionId: string }
  | { code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' }
  | { code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED'; organizationId: string }
  | { code: 'COST_CENTER_UNLINKED'; costCenterId: string }
  | { code: 'COST_CENTER_LINK_MISMATCH'; costCenterId: string; departmentId: string }
  | { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED'; organizationId: string }
  | { code: 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL' }
  | { code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING'; noticeId: string }
  | { code: 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING'; transferId: string }
  | { code: 'SERVICE_ACCOUNT_MOVE_PENDING'; moveId: string }
  | {
      code: 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS';
      proposalId: string;
      versionIds: string[];
      decisionIds: string[];
      relatedProposalIds: string[];
    }
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
  /** What the contract gates list without blocking: the rows the migrations of this release reconcile by themselves. */
  information: PreflightInformation[];
}
