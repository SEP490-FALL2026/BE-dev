import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import type { ExpiryReminderWire } from './expiry.dto';
import { ExpiryError } from './expiry.errors';
import { REMINDER_OPTIONS, reminderRange, remindersOwed, type ReminderAudience } from './expiry.policy';
import { ExpiryReminderRepo, type ReminderCandidate } from './expiry-reminder.repo';

/** How many rights one pass looks at; the next pass takes the rest. */
const PASS_BATCH = 200;

/**
 * The reminder that a right is about to end (`US-03-05` AC-1, AC-10). Once an hour every open personal right whose end date falls in
 * the next seven days is reminded, once for each right, end date and person: its holder, the head of their department today, and the
 * IT Admin in charge of it. A department with no head has no reminder for the head and nobody is told in its place. Each reminder
 * is a row and an audit event carrying the two choices (renew the right, or let it end): the point the inbox takes it from. Nothing
 * about the right is changed.
 */
@Injectable()
export class ExpiryReminderService {
  constructor(
    private readonly repo: ExpiryReminderRepo,
    private readonly organization: OrganizationService,
    private readonly catalog: CatalogService,
    private readonly runner: TransactionRunner,
    private readonly audit: AuditService,
  ) {}

  /** Writes the reminders that are due and returns how many were new in this pass. */
  async noticeDue(now: Date = new Date()): Promise<number> {
    const today = await this.organization.businessToday(now);
    const candidates = await this.repo.candidates(reminderRange(today), PASS_BATCH);
    if (candidates.length === 0) return 0;

    const departmentOf = await this.departmentsOf(candidates, today);
    const itAdminOf = await this.itAdminsOf(candidates, departmentOf, today);
    const headOf = await this.organization.getDepartmentHeads([...new Set(departmentOf.values())], today);
    let told = 0;
    for (const candidate of candidates) {
      const departmentId = departmentOf.get(candidate.employeeId) ?? null;
      const owed = remindersOwed({
        holderEmployeeId: candidate.employeeId,
        headEmployeeId: departmentId ? (headOf.get(departmentId)?.employeeId ?? null) : null,
        itAdminEmployeeId: departmentId ? (itAdminOf.get(departmentId) ?? null) : null,
      });
      told += await this.write(candidate, departmentId, owed);
    }

    return told;
  }

  /**
   * One page of reminders: those sent to the caller, or with scope all (IT Admin only) everyone's. Newest first. Throws
   * ExpiryError (`SCOPE_FORBIDDEN`).
   */
  async list(
    actor: AuthenticatedPrincipal,
    query: {
      scope: 'mine' | 'all';
      audience?: ReminderAudience;
      assignmentId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<ExpiryReminderWire>> {
    if (query.scope === 'all' && !actor.roles.includes('IT_ADMIN')) throw new ExpiryError('SCOPE_FORBIDDEN');
    const { rows, total } = await this.repo.page(
      {
        ...(query.scope === 'mine' ? { recipientEmployeeId: actor.employeeId } : {}),
        ...(query.audience ? { audience: query.audience } : {}),
        ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
      },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const [people, plans] = await Promise.all([
      this.organization.getEmployees([
        ...new Set(rows.flatMap((row) => [row.recipientEmployeeId, row.holderEmployeeId])),
      ]),
      this.catalog.getPlanRevocationInfo([...new Set(rows.map((row) => row.planId))]),
    ]);
    const personById = new Map(people.map((person) => [person.id, person]));
    const planById = new Map(plans.map((plan) => [plan.planId, plan]));
    const brief = (id: string) => {
      const person = personById.get(id);

      return person ? { id: person.id, employeeCode: person.employeeCode, fullName: person.fullName } : null;
    };

    const items = rows.flatMap((row): ExpiryReminderWire[] => {
      const recipient = brief(row.recipientEmployeeId);
      const holder = brief(row.holderEmployeeId);
      const plan = planById.get(row.planId);
      if (!recipient || !holder || !plan) return [];

      return [
        {
          id: row.id,
          assignmentId: row.assignmentId,
          audience: row.audience,
          expectedEndDate: row.expectedEndDate,
          recipient,
          holder,
          plan: {
            planId: plan.planId,
            planName: plan.planName,
            applicationId: plan.applicationId,
            applicationName: plan.applicationName,
          },
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** The department each holder is in today, one read for all of them. */
  private async departmentsOf(
    candidates: readonly ReminderCandidate[],
    today: BusinessDate,
  ): Promise<Map<string, string>> {
    const units = await this.organization.getOwningUnits([...new Set(candidates.map((c) => c.employeeId))], today);

    return new Map([...units].map(([employeeId, unit]) => [employeeId, unit.departmentId]));
  }

  /** The IT Admin in charge of each department, read once for each department through one of its people. */
  private async itAdminsOf(
    candidates: readonly ReminderCandidate[],
    departmentOf: ReadonlyMap<string, string>,
    today: BusinessDate,
  ): Promise<Map<string, string | null>> {
    const representative = new Map<string, string>();
    for (const candidate of candidates) {
      const departmentId = departmentOf.get(candidate.employeeId);
      if (departmentId && !representative.has(departmentId)) representative.set(departmentId, candidate.employeeId);
    }
    const found = await Promise.all(
      [...representative].map(
        async ([departmentId, employeeId]) =>
          [
            departmentId,
            (await this.organization.getItAdminInCharge(employeeId, today))?.itAdminEmployeeId ?? null,
          ] as const,
      ),
    );

    return new Map(found);
  }

  /** Writes the reminders of one right in one transaction, with the audit event of each new one; returns how many were new. */
  private async write(
    candidate: ReminderCandidate,
    departmentId: string | null,
    owed: readonly { audience: ReminderAudience; employeeId: string }[],
  ): Promise<number> {
    return this.runner.run(async (tx) => {
      const written = await this.repo.insertMany(
        tx,
        owed.map((entry) => ({
          organizationId: candidate.organizationId,
          assignmentId: candidate.assignmentId,
          expectedEndDate: candidate.expectedEndDate,
          audience: entry.audience,
          recipientEmployeeId: entry.employeeId,
          departmentId,
        })),
      );
      for (const reminder of written) {
        await this.audit.record(tx, {
          organizationId: candidate.organizationId,
          actorKind: 'SYSTEM',
          action: 'LICENSE_ASSIGNMENT.EXPIRY_REMINDER',
          resourceType: 'LicenseAssignment',
          resourceId: candidate.assignmentId,
          before: null,
          after: {
            audience: reminder.audience,
            recipientEmployeeId: reminder.recipientEmployeeId,
            holderEmployeeId: candidate.employeeId,
            planId: candidate.planId,
            departmentId,
            expectedEndDate: candidate.expectedEndDate,
            options: [...REMINDER_OPTIONS],
          },
          correlationId: candidate.assignmentId,
        });
      }

      return written.length;
    });
  }
}
