import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ConversionFacts, FORWARD_MIGRATION, MigrationRecord, UNIT_ONLY_MIGRATION } from './migration-preflight.types';

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

  /** The facts in the schema before the merged migration (or after a failed attempt, which left that schema). */
  async legacyFacts(tx: DbTx): Promise<ConversionFacts> {
    const serviceAccounts = await tx.$queryRaw<AccountRow[]>`
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
       ORDER BY a."id"`;
    const companyAllocations = await tx.$queryRaw<ConversionFacts['companyAllocations']>`
      SELECT v."id"::text AS "versionId", v."version" AS "version", c."code" AS "costCenter"
        FROM "subscription_cost_allocation_lines" l
        JOIN "subscription_cost_allocation_versions" v ON v."id" = l."version_id"
        JOIN "cost_centers" c ON c."id" = l."cost_center_id"
       WHERE c."kind"::text = 'COMPANY'
       ORDER BY v."id", c."code"`;
    const companyDepartments = await tx.$queryRaw<ConversionFacts['companyDepartments']>`
      SELECT d."code" AS "department", c."code" AS "costCenter"
        FROM "departments" d JOIN "cost_centers" c ON c."id" = d."cost_center_id"
       WHERE c."kind"::text = 'COMPANY'
       ORDER BY d."code"`;
    const companyCostCenters = await tx.$queryRaw<ConversionFacts['companyCostCenters']>`
      SELECT "code", "status"::text AS "status" FROM "cost_centers" WHERE "kind"::text = 'COMPANY' ORDER BY "code"`;

    return { serviceAccounts, companyAllocations, companyDepartments, companyCostCenters };
  }

  /** The facts after the merged migration: every service account has the owning department it stored. */
  async convertedFacts(tx: DbTx): Promise<ConversionFacts> {
    const serviceAccounts = await tx.$queryRaw<AccountRow[]>`
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
       ORDER BY a."id"`;

    return { serviceAccounts, companyAllocations: [], companyDepartments: [], companyCostCenters: [] };
  }
}
