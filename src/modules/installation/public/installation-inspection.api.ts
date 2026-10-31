import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessInspectionApi } from '../../identity-access/public/identity-access-inspection.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  BOOTSTRAP_ACTIONS,
  NO_ANNOUNCEMENT_GAPS,
  announcementGapTotal,
  bootstrapMismatches,
  maskEmail,
  problemsOf,
  summarizeMigrations,
} from '../inspect/inspection-facts.policy';
import { InstallationInspection, MigrationReport } from './inspection.types';
import { MigrationStateRepo } from '../inspect/migration-state.repo';

/** Prisma's code for a table that does not exist yet: a database migrated only part of the way. */
const TABLE_DOES_NOT_EXIST = 'P2021';

/**
 * `ops:inspect`: reads the installation state and reports counts and invariant failures. It writes nothing,
 * and cannot: its graph opens every PostgreSQL session read-only (ReadOnlyDatabaseSessionModule). Every database read
 * runs in the one transaction of the command, and the report is built from that one result.
 */
@Injectable()
export class InstallationInspectionApi {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly migrations: MigrationStateRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly identity: IdentityAccessInspectionApi,
  ) {}

  async inspect(): Promise<InstallationInspection> {
    const committed = this.migrations.committedMigrations();
    const snapshot = await this.runner.run(async (tx) => {
      const migrations = summarizeMigrations(committed, await this.migrations.appliedMigrations(tx));
      if (migrations.applied === 0) return { migrations, installed: null };
      const organization = await this.findOrganization(() => this.organizationReads.getOrganization(tx));
      if (organization === null) return { migrations, installed: null };

      const counts = await this.audit.countByAction(tx, BOOTSTRAP_ACTIONS);
      const inventory = await this.identity.accountInventory(tx);
      const facts = await this.organizationReads.getOnboardingFacts(tx);
      const named = facts.departmentsByItAdmin.flatMap((department) =>
        department.itAdminEmployeeId === null ? [] : [department.itAdminEmployeeId],
      );
      const usable = await this.identity.usableItAdminEmployeeIds(named, tx);

      // The changes the seeding migration missed. Read in the same transaction, only when that migration was recorded.
      const seededAt = await this.migrations.changeAnnouncementsSeededAt(tx);
      const announcements =
        seededAt === null ? NO_ANNOUNCEMENT_GAPS : await this.organizationReads.countUnmarkedChangesAsOf(tx, seededAt);

      return { migrations, installed: { organization, counts, inventory, facts, usable, announcements } };
    });
    if (snapshot.installed === null) return notInstalled(snapshot.migrations);

    const { organization, counts, inventory, facts, usable, announcements } = snapshot.installed;
    const mismatched = bootstrapMismatches(counts);
    const problems = problemsOf({
      migrations: snapshot.migrations,
      bootstrapMismatches: mismatched,
      changeAnnouncements: announcements,
      superAdmin: inventory.superAdmin,
    });

    return {
      status: problems.length === 0 ? 'INSTALLED' : 'INCOMPLETE',
      problems,
      migrations: snapshot.migrations,
      organization: { timeZone: organization.timeZone, reportingCurrency: organization.reportingCurrency },
      bootstrapRecords: { complete: mismatched.length === 0, mismatched },
      changeAnnouncements: { complete: announcementGapTotal(announcements) === 0, missing: announcements },
      superAdmin:
        inventory.superAdmin === null
          ? null
          : {
              holders: inventory.superAdmin.holders,
              status: inventory.superAdmin.status,
              activationState: inventory.superAdmin.activationState,
              maskedEmail: maskEmail(inventory.superAdmin.loginEmail),
            },
      accounts: {
        total: Object.values(inventory.accountsByState).reduce((sum, count) => sum + count, 0),
        byState: inventory.accountsByState,
      },
      directRoles: inventory.directRoles,
      approvalRoles: inventory.approvalRoles,
      departments: {
        active: facts.activeDepartments,
        withoutCurrentHead: facts.departmentsWithoutHead.length,
        withoutUsableItAdmin: facts.departmentsByItAdmin.filter(
          (department) =>
            department.itAdminEmployeeId === null ||
            department.itAdminStatus !== 'ACTIVE' ||
            !usable.has(department.itAdminEmployeeId),
        ).length,
      },
    };
  }

  /** The organization, or null when there is none or its table is not created yet. */
  private async findOrganization<T>(read: () => Promise<T | null>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === TABLE_DOES_NOT_EXIST) return null;
      throw error;
    }
  }
}

function notInstalled(migrations: MigrationReport): InstallationInspection {
  return {
    status: 'NOT_INSTALLED',
    problems: [],
    migrations,
    organization: null,
    bootstrapRecords: null,
    changeAnnouncements: null,
    superAdmin: null,
    accounts: null,
    directRoles: null,
    approvalRoles: null,
    departments: null,
  };
}
