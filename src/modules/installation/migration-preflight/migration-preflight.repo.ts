import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  ContractGateFacts,
  ConversionFacts,
  DirectRoleFacts,
  FORWARD_MIGRATION,
  LegacyReturnFacts,
  MigrationRecord,
  SubscriptionOwnerSchema,
  UNIT_ONLY_MIGRATION,
} from '../public/migration-preflight.types';
import { RecoveryTargetFacts } from '../public/recovery-target.policy';

/**
 * Reads the data the unit-only conversion touches, in the schema the database has **now** — before the merged migration
 * there is no `owning_department_id` and Cost Centers can be of kind COMPANY, so no business module's Prisma model can
 * read it; like `_prisma_migrations` for `ops:inspect`, this read belongs to the command, not to a module. Read only:
 * the graph opens every session read-only.
 *
 * The recorded day of a service account is the rule of the application (the seat baseline import owns it by the
 * department on the day it records, `seat-baseline-import.service.ts`): `valid_from` when the file gave no grant day
 * (`RECORDED`), else the day it was written in the organization's own calendar. The forward migration reads the same
 * expression.
 */
const RECORDED_ON = Prisma.sql`CASE WHEN a."valid_from_basis" = 'RECORDED' THEN a."valid_from"
  ELSE (a."created_at" AT TIME ZONE o."time_zone")::date END`;

interface AccountRow {
  assignmentId: string;
  employeeCode: string;
  validFrom: string;
  recordedOn: string;
  startDepartment: string | null;
  storedDepartment: string | null;
  recordedDepartment: string | null;
}

@Injectable()
export class MigrationPreflightRepo {
  /** The rows Prisma recorded for the two migrations, or null when no migration was ever applied. */
  async migrationRecords(tx: DbTx): Promise<MigrationRecord[] | null> {
    const [table] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!table.present) return null;

    return tx.$queryRaw<MigrationRecord[]>`
      SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack"
        FROM _prisma_migrations
       WHERE migration_name IN (${UNIT_ONLY_MIGRATION}, ${FORWARD_MIGRATION})
       ORDER BY migration_name, started_at`;
  }

  /**
   * P04-CPE-04 (spec L.12): the facts `--recovery-target` judges, in the schema the database has now. Probed first: an empty
   * database has no table at all (no history, no request). Before `…_access_request_draft` the column is `NOT NULL`, so the
   * count is 0 there. A draft keeps no Cost Center too, but no release reads a draft it did not write (the compatibility image
   * filters `DRAFT` out of every read), so only sent requests count. The two `QĐ-93` representations count rows in tables and
   * columns that older schemas lack, so each is probed before it is read.
   */
  async recoveryTargetFacts(tx: DbTx): Promise<RecoveryTargetFacts> {
    const [probe] = await tx.$queryRaw<{ history: boolean; requests: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "history",
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'access_requests'
                        AND column_name = 'cost_center_id') AS "requests"`;
    const [history] = probe.history
      ? await tx.$queryRaw<{ migrated: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM _prisma_migrations
                          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS "migrated"`
      : [{ migrated: false }];
    const [requests] = probe.requests
      ? await tx.$queryRaw<{ rows: number }[]>`
          SELECT count(*)::int AS "rows" FROM "access_requests"
           WHERE "cost_center_id" IS NULL AND "state"::text <> 'DRAFT'`
      : [{ rows: 0 }];

    return {
      migrated: history.migrated,
      rows: {
        'access-request-null-cost-center': requests.rows,
        'access-request-cancel-spending-approver-party': await this.cancelledBySpendingApproverPartyRows(tx),
        'access-request-step-qd93-waiting-reason': await this.qd93WaitingReasonRows(tx),
      },
    };
  }

  /** Whether the table has the column in this schema (an older database lacks the table or the column). */
  private async hasColumn(tx: DbTx, table: string, column: string): Promise<boolean> {
    const [row] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}) AS "present"`;

    return row.present;
  }

  /** `access-request-cancel-spending-approver-party`: the requests and the lines closed for the spending approver (`QĐ-93k(1)`). */
  private async cancelledBySpendingApproverPartyRows(tx: DbTx): Promise<number> {
    let rows = 0;
    if (await this.hasColumn(tx, 'access_requests', 'cancel_cause')) {
      const [requests] = await tx.$queryRaw<{ rows: number }[]>`
        SELECT count(*)::int AS "rows" FROM "access_requests" WHERE "cancel_cause"::text = 'SPENDING_APPROVER_PARTY'`;
      rows += requests.rows;
    }
    if (await this.hasColumn(tx, 'access_request_lines', 'cancel_cause')) {
      const [lines] = await tx.$queryRaw<{ rows: number }[]>`
        SELECT count(*)::int AS "rows" FROM "access_request_lines" WHERE "cancel_cause"::text = 'SPENDING_APPROVER_PARTY'`;
      rows += lines.rows;
    }

    return rows;
  }

  /** `access-request-step-qd93-waiting-reason`: the steps and the alerts that wait for a reason the release before it cannot list. */
  private async qd93WaitingReasonRows(tx: DbTx): Promise<number> {
    let rows = 0;
    if (await this.hasColumn(tx, 'access_request_steps', 'waiting_reason')) {
      const [steps] = await tx.$queryRaw<{ rows: number }[]>`
        SELECT count(*)::int AS "rows" FROM "access_request_steps"
         WHERE "waiting_reason" IN ('NO_DEPARTMENT_HEAD', 'SPENDING_APPROVER_IS_PARTY')`;
      rows += steps.rows;
    }
    if (await this.hasColumn(tx, 'controlled_wait_alerts', 'waiting_reason')) {
      const [alerts] = await tx.$queryRaw<{ rows: number }[]>`
        SELECT count(*)::int AS "rows" FROM "controlled_wait_alerts"
         WHERE "waiting_reason" IN ('NO_DEPARTMENT_HEAD', 'SPENDING_APPROVER_IS_PARTY')`;
      rows += alerts.rows;
    }

    return rows;
  }

  /** The facts in the schema before the merged migration (or after a failed attempt, which left that schema). */
  async legacyFacts(tx: DbTx): Promise<ConversionFacts> {
    const [assignmentsTable] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public.license_assignments') IS NOT NULL AS present`;
    const [allocationsTable] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public.subscription_cost_allocation_lines') IS NOT NULL AS present`;
    const [departmentsTable] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public.departments') IS NOT NULL AS present`;
    const [costCentersTable] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public.cost_centers') IS NOT NULL AS present`;

    const serviceAccounts = assignmentsTable?.present
      ? await tx.$queryRaw<AccountRow[]>`
      SELECT a."id"::text AS "assignmentId", e."employee_code" AS "employeeCode",
             to_char(a."valid_from", 'YYYY-MM-DD') AS "validFrom", to_char(r.day, 'YYYY-MM-DD') AS "recordedOn",
             sd."code" AS "startDepartment", NULL::text AS "storedDepartment", rd."code" AS "recordedDepartment"
        FROM "license_assignments" a
        JOIN "employees" e ON e."id" = a."employee_id"
        JOIN "organizations" o ON o."id" = a."organization_id"
        CROSS JOIN LATERAL (SELECT ${RECORDED_ON} AS day) r
        LEFT JOIN "employee_placements" sp ON sp."employee_id" = a."employee_id" AND sp."valid_from" <= a."valid_from"
             AND (sp."valid_to" IS NULL OR a."valid_from" < sp."valid_to")
        LEFT JOIN "departments" sd ON sd."id" = sp."department_id"
        LEFT JOIN "employee_placements" rp ON rp."employee_id" = a."employee_id" AND rp."valid_from" <= r.day
             AND (rp."valid_to" IS NULL OR r.day < rp."valid_to")
        LEFT JOIN "departments" rd ON rd."id" = rp."department_id"
       WHERE a."kind" = 'SERVICE'
       ORDER BY a."id"`
      : [];
    const companyAllocations = allocationsTable?.present
      ? await tx.$queryRaw<ConversionFacts['companyAllocations']>`
      SELECT v."id"::text AS "versionId", v."version" AS "version", c."code" AS "costCenter"
        FROM "subscription_cost_allocation_lines" l
        JOIN "subscription_cost_allocation_versions" v ON v."id" = l."version_id"
        JOIN "cost_centers" c ON c."id" = l."cost_center_id"
       WHERE c."kind"::text = 'COMPANY'
       ORDER BY v."id", c."code"`
      : [];
    const companyDepartments =
      departmentsTable?.present && costCentersTable?.present
        ? await tx.$queryRaw<ConversionFacts['companyDepartments']>`
      SELECT d."code" AS "department", c."code" AS "costCenter"
        FROM "departments" d JOIN "cost_centers" c ON c."id" = d."cost_center_id"
       WHERE c."kind"::text = 'COMPANY'
       ORDER BY d."code"`
        : [];
    const companyCostCenters = costCentersTable?.present
      ? await tx.$queryRaw<ConversionFacts['companyCostCenters']>`
      SELECT "code", "status"::text AS "status" FROM "cost_centers" WHERE "kind"::text = 'COMPANY' ORDER BY "code"`
      : [];

    return { serviceAccounts, companyAllocations, companyDepartments, companyCostCenters };
  }

  /**
   * The facts of the contract gates (spec L.10), in the schema the database has now. Each gate probes `information_schema`
   * and `to_regclass` first and names an object only after the probe saw it, so the same read serves a database before
   * the expansion migration, on the compatibility schema, on the final one (where the objects of the destructive migrations
   * are gone) and an empty one.
   */
  async contractGateFacts(tx: DbTx): Promise<ContractGateFacts> {
    return {
      subscriptionOwner: await this.subscriptionOwnerFacts(tx),
      costCenterDirection: await this.costCenterDirectionFacts(tx),
      retiredKinds: await this.retiredKindFacts(tx),
      legacyReturns: await this.legacyReturnFacts(tx),
    };
  }

  /**
   * The proposals `7c28e75` gave back because the first version made from them was refused (F63, spec J.2): the three tables exist
   * from the budgets migration on, so they are probed (an empty or older database has none). Only ids and flags are read; the reason
   * of a refusal is compared in the database and never leaves it. The same expressions as the first block of
   * `20261029100600_budget_lifecycle_structure`. That migration reconciles these rows and adds `successor_of_proposal_id`; from then
   * on a returned proposal that has a refusal on a version is an ordinary one (Finance returned it afterwards), not a row of the old
   * path, so nothing is read once the column is there.
   */
  private async legacyReturnFacts(tx: DbTx): Promise<LegacyReturnFacts> {
    const [probe] = await tx.$queryRaw<{ present: boolean; reconciled: boolean }[]>`
      SELECT to_regclass('public.budget_proposals') IS NOT NULL AND to_regclass('public.budget_versions') IS NOT NULL
             AND to_regclass('public.budget_version_decisions') IS NOT NULL AS "present",
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'budget_proposals'
                        AND column_name = 'successor_of_proposal_id') AS "reconciled"`;
    if (!probe.present || probe.reconciled) return { candidates: [], neighbours: [] };

    const candidates = await tx.$queryRaw<LegacyReturnFacts['candidates']>`
      SELECT p."id"::text AS "proposalId",
             array_agg(DISTINCT v."id"::text ORDER BY v."id"::text) AS "versionIds",
             array_agg(DISTINCT d."id"::text ORDER BY d."id"::text) AS "decisionIds",
             (count(*) = 1 AND bool_and(v."kind"::text = 'INITIAL' AND v."state"::text = 'REJECTED'
                AND d."decided_by_employee_id" = p."returned_by_employee_id"
                AND d."reason" IS NOT DISTINCT FROM p."returned_reason"
                AND d."decided_at" = p."returned_at")) AS "traced"
        FROM "budget_proposals" p
        JOIN "budget_versions" v ON v."proposal_id" = p."id"
        JOIN "budget_version_decisions" d ON d."version_id" = v."id" AND d."decision"::text = 'REJECTED'
       WHERE p."state"::text = 'RETURNED'
       GROUP BY p."id"
       ORDER BY p."id"`;
    if (candidates.length === 0) return { candidates, neighbours: [] };

    const neighbours = await tx.$queryRaw<LegacyReturnFacts['neighbours']>`
      SELECT p."id"::text AS "proposalId", q."id"::text AS "id", q."previous_proposal_id"::text AS "previousProposalId",
             (q."submitted_at" > p."returned_at") AS "submittedAfter"
        FROM "budget_proposals" p
        JOIN "budget_proposals" q
          ON q."organization_id" = p."organization_id" AND q."cost_center_id" = p."cost_center_id" AND q."year" = p."year"
         AND q."id" <> p."id" AND (q."submitted_at" > p."returned_at" OR q."previous_proposal_id" = p."id")
       WHERE p."id" = ANY(${candidates.map((row) => row.proposalId)}::uuid[])
       ORDER BY p."id", q."id"`;

    return { candidates, neighbours };
  }

  /**
   * The waiting rows of the kinds the release after this one no longer takes (F41, F06, spec L.4, L.5): a `BM-09` notice of a
   * change of job title that still waits, a transfer that waits and changes the job title only (the department stays), and a
   * proposal to move a service account that still waits. Their columns exist in every history, so only the tables are probed
   * (an empty database has none). The IT Admin rejects the notice, cancels the transfer and cancels the proposal with the fixed
   * reasons of the spec, on the release that is running, before the deploy.
   */
  private async retiredKindFacts(tx: DbTx): Promise<ContractGateFacts['retiredKinds']> {
    const [probe] = await tx.$queryRaw<{ hasNotices: boolean; hasTransfers: boolean; hasMoves: boolean }[]>`
      SELECT to_regclass('public.personnel_notices') IS NOT NULL AS "hasNotices",
             to_regclass('public.department_transfers') IS NOT NULL AS "hasTransfers",
             to_regclass('public.service_account_moves') IS NOT NULL AS "hasMoves"`;
    const notices = probe.hasNotices
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "personnel_notices"
           WHERE "kind"::text = 'JOB_TITLE_CHANGE' AND "status"::text = 'PENDING_VERIFICATION' ORDER BY "id"`
      : [];
    const transfers = probe.hasTransfers
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "department_transfers"
           WHERE "status"::text = 'PENDING' AND "from_department_id" = "to_department_id" ORDER BY "id"`
      : [];

    const moves = probe.hasMoves
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "service_account_moves" WHERE "status"::text = 'PENDING' ORDER BY "id"`
      : [];

    return {
      pendingNoticeIds: notices.map((row) => row.id),
      pendingTransferIds: transfers.map((row) => row.id),
      pendingMoveIds: moves.map((row) => row.id),
    };
  }

  /**
   * The Cost Center link (F01, spec L.11), as the FINAL release reads it. Probed first like every gate. Before the compatibility
   * migration the organizations of the database are listed: the release skipped the expansion. On the compatibility schema,
   * while the old column `departments.cost_center_id` still exists, every Cost Center with no department — computed on every
   * run, so a row the previous release writes after the migration or after a recovery is listed — a department whose own column
   * contradicts the link, and the organizations not yet activated (the three the migration `…_cost_center_belongs_to_department`
   * raises for). Once that migration has dropped the old column the schema requires the link and the final installation writes no
   * activation row, so none of the three is read: nothing about the direction can be open.
   */
  private async costCenterDirectionFacts(tx: DbTx): Promise<ContractGateFacts['costCenterDirection']> {
    const [probe] = await tx.$queryRaw<
      {
        hasCostCenters: boolean;
        hasColumn: boolean;
        hasLinks: boolean;
        hasActivations: boolean;
        hasOldColumn: boolean;
        hasOrganizations: boolean;
      }[]
    >`
      SELECT to_regclass('public.cost_centers') IS NOT NULL AS "hasCostCenters",
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'cost_centers'
                        AND column_name = 'department_id') AS "hasColumn",
             to_regclass('public.cost_center_department_links') IS NOT NULL AS "hasLinks",
             to_regclass('public.cost_center_direction_activations') IS NOT NULL AS "hasActivations",
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'departments'
                        AND column_name = 'cost_center_id') AS "hasOldColumn",
             to_regclass('public.organizations') IS NOT NULL AS "hasOrganizations"`;
    const none = { organizationIds: [], costCenterIds: [], mismatches: [], notActivated: [] };
    if (!probe.hasCostCenters) return { schema: 'NO_TABLE', ...none };

    const present = [probe.hasColumn, probe.hasLinks, probe.hasActivations];
    if (present.every((seen) => !seen)) {
      const organizations = probe.hasOrganizations
        ? await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS "id" FROM "organizations" ORDER BY "id"`
        : [];

      return { schema: 'ABSENT', ...none, organizationIds: organizations.map((row) => row.id) };
    }
    if (!present.every(Boolean)) return { schema: 'PARTIAL', ...none };
    // The final schema: the link is a NOT NULL column, the old department column is gone and no activation is read.
    if (!probe.hasOldColumn) return { schema: 'READY', ...none };

    const unlinked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "cost_centers" WHERE "department_id" IS NULL ORDER BY "id"`;
    const mismatches = await tx.$queryRaw<{ costCenterId: string; departmentId: string }[]>`
      SELECT c."id"::text AS "costCenterId", d."id"::text AS "departmentId"
        FROM "departments" d JOIN "cost_centers" c ON c."id" = d."cost_center_id"
       WHERE c."department_id" IS DISTINCT FROM d."id" ORDER BY c."id"`;
    const notActivated = await tx.$queryRaw<{ id: string }[]>`
      SELECT o."id"::text AS "id" FROM "organizations" o
       WHERE NOT EXISTS (SELECT 1 FROM "cost_center_direction_activations" a WHERE a."organization_id" = o."id")
       ORDER BY o."id"`;

    return {
      schema: 'READY',
      organizationIds: [],
      costCenterIds: unlinked.map((row) => row.id),
      mismatches,
      notActivated: notActivated.map((row) => row.id),
    };
  }

  /**
   * The owner department of a subscription (F02, spec L.3). Before the expansion migration every subscription is listed (the
   * database skipped the expansion). Valid assignment: exactly one row for the subscription, of the same organization, to a
   * department of that organization. Open: no owner department and no valid assignment, or an owner department the assignment
   * contradicts — none once the final migration made the column required. The ids come out sorted and nothing else is read.
   */
  private async subscriptionOwnerFacts(tx: DbTx): Promise<ContractGateFacts['subscriptionOwner']> {
    const [probe] = await tx.$queryRaw<{ hasSubscriptions: boolean; hasColumn: boolean; hasTable: boolean }[]>`
      SELECT to_regclass('public.subscriptions') IS NOT NULL AS "hasSubscriptions",
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'subscriptions'
                        AND column_name = 'owner_department_id') AS "hasColumn",
             to_regclass('public.subscription_owner_assignments') IS NOT NULL AS "hasTable"`;
    if (!probe.hasSubscriptions) return { schema: 'NO_TABLE', subscriptionIds: [] };

    const schema: SubscriptionOwnerSchema =
      probe.hasColumn && probe.hasTable ? 'READY' : !probe.hasColumn && !probe.hasTable ? 'ABSENT' : 'PARTIAL';
    if (schema === 'PARTIAL') return { schema, subscriptionIds: [] };
    if (schema === 'ABSENT') {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS "id" FROM "subscriptions" ORDER BY "id"`;

      return { schema, subscriptionIds: rows.map((row) => row.id) };
    }

    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT s."id"::text AS "id"
        FROM "subscriptions" s
        LEFT JOIN "subscription_owner_assignments" a ON a."subscription_id" = s."id"
        LEFT JOIN "departments" d ON d."id" = a."department_id"
       WHERE (s."owner_department_id" IS NULL
              AND (a."id" IS NULL OR d."id" IS NULL
                   OR a."organization_id" <> s."organization_id" OR d."organization_id" <> s."organization_id"))
          OR (s."owner_department_id" IS NOT NULL AND a."id" IS NOT NULL
              AND (a."department_id" <> s."owner_department_id"
                   OR a."organization_id" <> s."organization_id" OR d."organization_id" <> s."organization_id"))
       ORDER BY s."id"`;

    return { schema, subscriptionIds: rows.map((row) => row.id) };
  }

  /**
   * `QĐ-93k(4)`: the rows `…_identity_direct_roles` stops for, read only while that migration is not applied (the same four
   * kinds its guard raises for, and no more). Read in the schema the database has **now**, before the migration: the spending
   * approver is the open row of `approval_role_holders`, and the roles that cannot go with it are read from `role_grants` as text,
   * so no value of the new enum is named (`'MANAGER'::"AppRole"` does not exist yet). A head is a head today or later in the
   * calendar of the organization, the day the migration reads. Codes of people and departments only.
   */
  async directRoleFacts(tx: DbTx): Promise<DirectRoleFacts> {
    const none: DirectRoleFacts = {
      headsWithoutAccount: [],
      spendingApproverHeads: [],
      spendingApproverHoldsRoles: [],
      spendingApproverWithoutAccount: [],
    };
    const [probe] = await tx.$queryRaw<{ ready: boolean; history: boolean }[]>`
      SELECT (to_regclass('public.department_head_periods') IS NOT NULL AND to_regclass('public.approval_role_holders') IS NOT NULL
              AND to_regclass('public.app_users') IS NOT NULL AND to_regclass('public.role_grants') IS NOT NULL
              AND to_regclass('public.employees') IS NOT NULL AND to_regclass('public.departments') IS NOT NULL
              AND to_regclass('public.organizations') IS NOT NULL) AS "ready",
             to_regclass('public._prisma_migrations') IS NOT NULL AS "history"`;
    if (!probe.ready) return none;
    if (probe.history) {
      const [applied] = await tx.$queryRaw<{ applied: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM _prisma_migrations
                        WHERE migration_name ~ '_identity_direct_roles$'
                          AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS "applied"`;
      if (applied.applied) return none;
    }

    const headsWithoutAccount = await tx.$queryRaw<DirectRoleFacts['headsWithoutAccount']>`
      SELECT DISTINCT e."employee_code" AS "employeeCode", d."code" AS "department"
        FROM "department_head_periods" p
        JOIN "employees" e ON e."id" = p."employee_id"
        JOIN "departments" d ON d."id" = p."department_id"
        JOIN "organizations" o ON o."id" = p."organization_id"
       WHERE (p."valid_to" IS NULL OR p."valid_to" > (now() AT TIME ZONE o."time_zone")::date)
         AND NOT EXISTS (SELECT 1 FROM "app_users" u WHERE u."employee_id" = e."id")
       ORDER BY e."employee_code", d."code"`;
    const spendingApproverHeads = await tx.$queryRaw<DirectRoleFacts['spendingApproverHeads']>`
      SELECT DISTINCT e."employee_code" AS "employeeCode", d."code" AS "department"
        FROM "approval_role_holders" h
        JOIN "employees" e ON e."id" = h."employee_id"
        JOIN "department_head_periods" p ON p."employee_id" = e."id"
        JOIN "departments" d ON d."id" = p."department_id"
        JOIN "organizations" o ON o."id" = p."organization_id"
       WHERE h."role"::text = 'SPENDING_APPROVER' AND h."held_until" IS NULL
         AND (p."valid_to" IS NULL OR p."valid_to" > (now() AT TIME ZONE o."time_zone")::date)
       ORDER BY e."employee_code", d."code"`;
    const spendingApproverHoldsRoles = await tx.$queryRaw<DirectRoleFacts['spendingApproverHoldsRoles']>`
      SELECT DISTINCT e."employee_code" AS "employeeCode", g."role"::text AS "role"
        FROM "approval_role_holders" h
        JOIN "employees" e ON e."id" = h."employee_id"
        JOIN "app_users" u ON u."employee_id" = e."id"
        JOIN "role_grants" g ON g."app_user_id" = u."id"
       WHERE h."role"::text = 'SPENDING_APPROVER' AND h."held_until" IS NULL AND g."revoked_at" IS NULL
         AND g."role"::text IN ('SUPER_ADMIN', 'IT_ADMIN', 'FINANCE')
       ORDER BY e."employee_code", g."role"::text`;
    const spendingApproverWithoutAccount = await tx.$queryRaw<DirectRoleFacts['spendingApproverWithoutAccount']>`
      SELECT DISTINCT e."employee_code" AS "employeeCode"
        FROM "approval_role_holders" h
        JOIN "employees" e ON e."id" = h."employee_id"
       WHERE h."role"::text = 'SPENDING_APPROVER' AND h."held_until" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "app_users" u WHERE u."employee_id" = e."id")
       ORDER BY e."employee_code"`;

    return { headsWithoutAccount, spendingApproverHeads, spendingApproverHoldsRoles, spendingApproverWithoutAccount };
  }

  /** The facts after the merged migration: every service account has the owning department it stored. */
  async convertedFacts(tx: DbTx): Promise<ConversionFacts> {
    const [assignmentsTable] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public.license_assignments') IS NOT NULL AS present`;

    const serviceAccounts = assignmentsTable?.present
      ? await tx.$queryRaw<AccountRow[]>`
      SELECT a."id"::text AS "assignmentId", e."employee_code" AS "employeeCode",
             to_char(a."valid_from", 'YYYY-MM-DD') AS "validFrom", to_char(r.day, 'YYYY-MM-DD') AS "recordedOn",
             NULL::text AS "startDepartment", od."code" AS "storedDepartment", rd."code" AS "recordedDepartment"
        FROM "license_assignments" a
        JOIN "employees" e ON e."id" = a."employee_id"
        JOIN "organizations" o ON o."id" = a."organization_id"
        CROSS JOIN LATERAL (SELECT ${RECORDED_ON} AS day) r
        LEFT JOIN "departments" od ON od."id" = a."owning_department_id"
        LEFT JOIN "employee_placements" rp ON rp."employee_id" = a."employee_id" AND rp."valid_from" <= r.day
             AND (rp."valid_to" IS NULL OR r.day < rp."valid_to")
        LEFT JOIN "departments" rd ON rd."id" = rp."department_id"
       WHERE a."kind" = 'SERVICE'
       ORDER BY a."id"`
      : [];

    return { serviceAccounts, companyAllocations: [], companyDepartments: [], companyCostCenters: [] };
  }
}
