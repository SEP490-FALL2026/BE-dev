import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import type { UnplacedWorkKind } from '../public/organization.types';
import {
  UnplacedWorkDesignationAlreadyActiveError,
  UnplacedWorkDesignationAlreadyEndedError,
  UnplacedWorkDesignationEmployeePlacedError,
  UnplacedWorkDesignationNotFoundError,
  UnplacedWorkDesignationNotUsableError,
} from './unplaced-work-designation.errors';
import type { UnplacedWorkDesignationRecord, UnplacedWorkDesignationView } from './unplaced-work-designation.mapper';
import {
  assertMayManageUnplacedWorkDesignations,
  type AppointUnplacedWorkVerdict,
  judgeAppointUnplacedWork,
  unplacedWorkDesignationListScope,
} from './unplaced-work-designation.policy';
import { UnplacedWorkDesignationRepo } from './unplaced-work-designation.repo';

/**
 * Lock order:
 * - appoint: tier 1 `employees` FOR UPDATE for `employeeId` and `designeeEmployeeId` in one query ordered by `id ASC`.
 * - end: tier 1 `employees` FOR UPDATE for the designation's `employeeId`, then re-read and close the designation row.
 */
function throwForAppointVerdict(verdict: Exclude<AppointUnplacedWorkVerdict, 'OK'>, employeeId: string): never {
  if (verdict === 'MISSING_EMPLOYEE') throw new EmployeeNotFoundError(employeeId);
  if (verdict === 'EMPLOYEE_PLACED') throw new UnplacedWorkDesignationEmployeePlacedError();
  if (verdict === 'NOT_USABLE_IT_ADMIN') throw new UnplacedWorkDesignationNotUsableError();
  throw new UnplacedWorkDesignationAlreadyActiveError();
}

@Injectable()
export class UnplacedWorkDesignationService {
  constructor(
    private readonly repo: UnplacedWorkDesignationRepo,
    private readonly employees: EmployeeRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly context: OrganizationContextService,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
    private readonly runner: TransactionRunner,
  ) {}

  async appoint(
    actor: AuthenticatedPrincipal,
    input: {
      employeeId: string;
      designeeEmployeeId: string;
      reason: string;
      works: readonly { workKind: UnplacedWorkKind; workId: string }[];
    },
  ): Promise<{ items: UnplacedWorkDesignationView[] }> {
    assertMayManageUnplacedWorkDesignations(actor.roles);
    const reason = input.reason.normalize('NFC').trim();
    const organization = await this.requireOrganization();

    return this.runner.run((tx) =>
      this.appointInTx(tx, actor, organization.id, {
        employeeId: input.employeeId,
        designeeEmployeeId: input.designeeEmployeeId,
        reason,
        works: input.works,
      }),
    );
  }

  private async appointInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    input: {
      employeeId: string;
      designeeEmployeeId: string;
      reason: string;
      works: readonly { workKind: UnplacedWorkKind; workId: string }[];
    },
  ): Promise<{ items: UnplacedWorkDesignationView[] }> {
    // Tier 1 lock: lock target employee and designee in one query ordered by id ASC.
    const employeeIdsToLock = [...new Set([input.employeeId, input.designeeEmployeeId])];
    await this.repo.lockEmployeesForUpdate(tx, employeeIdsToLock);
    await this.assertAppointAllowed(tx, employeeIdsToLock, input);

    const created = await this.repo.insertMany(tx, {
      organizationId,
      employeeId: input.employeeId,
      designeeEmployeeId: input.designeeEmployeeId,
      reason: input.reason,
      appointedAt: new Date(),
      appointedByAppUserId: actor.appUserId,
      works: input.works,
    });

    for (const item of created) {
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organizationId,
          'UNPLACED_WORK_DESIGNATION.APPOINTED',
          'UnplacedWorkItDesignation',
          item.id,
          null,
          {
            workKind: item.workKind,
            workId: item.workId,
            employeeId: item.employee.id,
            designeeEmployeeId: item.designee.id,
            reason: item.reason,
          },
        ),
      );
      await this.notifyDesignated(tx, organizationId, item);
    }

    return { items: created.map((item) => ({ ...item, designeeUsable: true })) };
  }

  private async assertAppointAllowed(
    tx: DbTx,
    employeeIdsToLock: string[],
    input: {
      employeeId: string;
      designeeEmployeeId: string;
      works: readonly { workKind: UnplacedWorkKind; workId: string }[];
    },
  ): Promise<void> {
    const found = await this.employees.findMany(employeeIdsToLock, tx);
    const target = found.find((employee) => employee.id === input.employeeId) ?? null;
    const designee = found.find((employee) => employee.id === input.designeeEmployeeId) ?? null;

    const employeeHasAnyPlacement =
      target !== null ? !(await this.employees.unplacedAmong([target.id], tx)).has(target.id) : false;
    const shouldInspectDesignee = target !== null && !employeeHasAnyPlacement && designee?.status === 'ACTIVE';
    const designeeIsUsableItAdmin = shouldInspectDesignee
      ? await this.isAccountUsableItAdmin(tx, input.designeeEmployeeId)
      : false;
    const activeExisting =
      target !== null && !employeeHasAnyPlacement && designeeIsUsableItAdmin
        ? await this.repo.findActiveByWorks(tx, input.works)
        : [];

    const verdict = judgeAppointUnplacedWork({
      employeeExists: target !== null,
      employeeHasAnyPlacement,
      designeeIsUsableItAdmin,
      hasAnyActiveDesignation: activeExisting.length > 0,
    });
    if (verdict !== 'OK') throwForAppointVerdict(verdict, input.employeeId);
  }

  async end(actor: AuthenticatedPrincipal, id: string): Promise<UnplacedWorkDesignationView> {
    assertMayManageUnplacedWorkDesignations(actor.roles);
    const organization = await this.requireOrganization();

    const ended = await this.runner.run(async (tx) => {
      const initial = await this.repo.findById(id, tx);
      if (!initial) throw new UnplacedWorkDesignationNotFoundError();
      await this.employees.lock(tx, initial.employee.id, 'UPDATE');

      const current = await this.repo.findById(id, tx);
      if (!current) throw new UnplacedWorkDesignationNotFoundError();
      if (current.endedAt !== null) throw new UnplacedWorkDesignationAlreadyEndedError();

      const endedAt = new Date();
      const updated = await this.repo.endById(tx, {
        id,
        endedAt,
        endedByAppUserId: actor.appUserId,
        endCause: 'REMOVED',
      });

      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'UNPLACED_WORK_DESIGNATION.ENDED',
          'UnplacedWorkItDesignation',
          id,
          {
            workKind: current.workKind,
            workId: current.workId,
            employeeId: current.employee.id,
            designeeEmployeeId: current.designee.id,
            endedAt: null,
            endCause: null,
          },
          {
            workKind: current.workKind,
            workId: current.workId,
            employeeId: current.employee.id,
            designeeEmployeeId: current.designee.id,
            endedAt: endedAt.toISOString(),
            endCause: 'REMOVED',
          },
        ),
      );

      return updated;
    });

    const usable = await this.employeeAccounts.get().findUsableItAdminEmployeeIds([ended.designee.id]);

    return { ...ended, designeeUsable: ended.designeeStatus === 'ACTIVE' && usable.has(ended.designee.id) };
  }

  async list(
    principal: AuthenticatedPrincipal,
    query: {
      state: 'ACTIVE' | 'ENDED' | 'ALL';
      workKind?: UnplacedWorkKind;
      employeeId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<UnplacedWorkDesignationView>> {
    const scopeMode = unplacedWorkDesignationListScope(principal.roles);
    const { items, total } = await this.repo.list({
      state: query.state,
      ...(query.workKind ? { workKind: query.workKind } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(scopeMode === 'DESIGNEE_ONLY' ? { designeeEmployeeId: principal.employeeId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const usable =
      items.length === 0
        ? new Set<string>()
        : await this.employeeAccounts
            .get()
            .findUsableItAdminEmployeeIds([
              ...new Set(items.map((item: UnplacedWorkDesignationRecord) => item.designee.id)),
            ]);

    return pageOf(
      items.map((item) => ({
        ...item,
        designeeUsable: item.designeeStatus === 'ACTIVE' && usable.has(item.designee.id),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async isAccountUsableItAdmin(tx: DbTx, employeeId: string): Promise<boolean> {
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);

    return account.usable && account.roles.includes('IT_ADMIN');
  }

  private async notifyDesignated(
    tx: DbTx,
    organizationId: string,
    created: UnplacedWorkDesignationRecord,
  ): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId,
      recipientEmployeeId: created.designee.id,
      code: 'UNPLACED_WORK_DESIGNATED',
      subject: { type: 'UNPLACED_WORK_DESIGNATION', id: created.id },
      params: {
        designationId: created.id,
        workKind: created.workKind,
        workId: created.workId,
        employeeId: created.employee.id,
      },
      eventKey: `unplacedWorkDesignated:${created.id}`,
    });
  }

  private async requireOrganization() {
    const record = await this.context.findOrganization();
    if (!record) throw new Error('Unplaced-work IT designations were used before installation');

    return record;
  }
}
