import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { DepartmentRecordService } from '../department/department-record.service';
import { DepartmentNotFoundError } from '../department/department.errors';
import { DepartmentRepo } from '../department/department.repo';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import {
  DepartmentItSubstituteAlreadyActiveError,
  DepartmentItSubstituteAlreadyEndedError,
  DepartmentItSubstituteDepartmentInactiveError,
  DepartmentItSubstituteIsInChargeError,
  DepartmentItSubstituteNotFoundError,
  DepartmentItSubstituteNotUsableError,
} from './department-it-substitute.errors';
import type { DepartmentItSubstituteRecord, DepartmentItSubstituteView } from './department-it-substitute.mapper';
import {
  assertMayManageItSubstitutes,
  type AppointSubstituteVerdict,
  itAdminLoadOf,
  type ItAdminLoad,
  itSubstituteListScope,
  judgeAppoint,
} from './department-it-substitute.policy';
import { DepartmentItSubstituteRepo } from './department-it-substitute.repo';

function throwForAppointVerdict(verdict: Exclude<AppointSubstituteVerdict, 'OK'>): never {
  if (verdict === 'MISSING_DEPARTMENT') throw new DepartmentNotFoundError();
  if (verdict === 'INACTIVE_DEPARTMENT') throw new DepartmentItSubstituteDepartmentInactiveError();
  if (verdict === 'ALREADY_ACTIVE') throw new DepartmentItSubstituteAlreadyActiveError();
  if (verdict === 'NOT_USABLE_IT_ADMIN') throw new DepartmentItSubstituteNotUsableError();
  throw new DepartmentItSubstituteIsInChargeError();
}

@Injectable()
export class DepartmentItSubstituteService {
  constructor(
    private readonly repo: DepartmentItSubstituteRepo,
    private readonly departments: DepartmentRepo,
    private readonly departmentRecords: DepartmentRecordService,
    private readonly employees: EmployeeRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
    private readonly context: OrganizationContextService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async appoint(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    input: { substituteEmployeeId: string; reason: string },
  ): Promise<{ substitute: DepartmentItSubstituteView; itAdminLoad: ItAdminLoad }> {
    assertMayManageItSubstitutes(actor.roles);
    const reason = input.reason.normalize('NFC').trim();
    const organization = await this.requireOrganization();

    return this.runner.run((tx) =>
      this.appointInTx(tx, actor, organization.id, departmentId, {
        substituteEmployeeId: input.substituteEmployeeId,
        reason,
      }),
    );
  }

  private async appointInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    departmentId: string,
    input: { substituteEmployeeId: string; reason: string },
  ): Promise<{ substitute: DepartmentItSubstituteView; itAdminLoad: ItAdminLoad }> {
    // Lock order: tier 1 employee FOR UPDATE (candidate), then tier 2 department FOR UPDATE.
    const employee = await this.lockAndReadCandidate(tx, input.substituteEmployeeId);
    const department = await this.departments.lock(tx, departmentId, 'UPDATE');
    const replacedEmployeeId = await this.assertAppointAllowed(tx, department, employee, input.substituteEmployeeId);

    const created = await this.repo.insert(tx, {
      organizationId,
      departmentId,
      substituteEmployeeId: input.substituteEmployeeId,
      replacedEmployeeId,
      reason: input.reason,
      appointedAt: new Date(),
      appointedByAppUserId: actor.appUserId,
    });

    const inChargeCount = await this.departments.countActiveInChargeExcludingStarting(tx, input.substituteEmployeeId);
    const substituteCount = await this.repo.countActiveBySubstitute(tx, input.substituteEmployeeId);
    const itAdminLoad = itAdminLoadOf({ employeeId: input.substituteEmployeeId, inChargeCount, substituteCount });

    await this.audit.record(
      tx,
      organizationAuditEvent(
        actor,
        organizationId,
        'DEPARTMENT_IT_SUBSTITUTE.APPOINTED',
        'DepartmentItSubstitute',
        created.id,
        null,
        {
          departmentId,
          substituteEmployeeId: input.substituteEmployeeId,
          replacedEmployeeId,
          reason: input.reason,
          ...(itAdminLoad.overLimit ? { overLimit: true } : {}),
        },
      ),
    );

    return { substitute: { ...created, substituteUsable: true }, itAdminLoad };
  }

  private async assertAppointAllowed(
    tx: DbTx,
    department: Awaited<ReturnType<DepartmentRepo['lock']>>,
    employee: Awaited<ReturnType<EmployeeRecordService['find']>>,
    candidateEmployeeId: string,
  ): Promise<string | null> {
    const existing = department ? await this.repo.findActiveByDepartmentId(tx, department.id) : null;
    const shouldInspectAccount = department?.status === 'ACTIVE' && existing === null && employee?.status === 'ACTIVE';
    const candidateIsUsableItAdmin = shouldInspectAccount
      ? await this.isAccountUsableItAdmin(tx, candidateEmployeeId)
      : false;
    const currentInChargeEmployeeId = department?.itAdmin?.employeeId ?? null;

    const verdict = judgeAppoint({
      departmentExists: department !== null,
      departmentActive: department?.status === 'ACTIVE',
      hasActiveSubstitute: existing !== null,
      currentInChargeEmployeeId,
      candidateEmployeeId,
      candidateIsUsableItAdmin,
    });
    if (verdict !== 'OK') throwForAppointVerdict(verdict);

    return currentInChargeEmployeeId;
  }

  async end(actor: AuthenticatedPrincipal, id: string): Promise<DepartmentItSubstituteView> {
    assertMayManageItSubstitutes(actor.roles);
    const organization = await this.requireOrganization();

    const ended = await this.runner.run(async (tx) => {
      const initial = await this.repo.findById(id, tx);
      if (!initial) throw new DepartmentItSubstituteNotFoundError();
      await this.departments.lock(tx, initial.department.id, 'UPDATE');

      const current = await this.repo.findById(id, tx);
      if (!current) throw new DepartmentItSubstituteNotFoundError();
      if (current.endedAt !== null) throw new DepartmentItSubstituteAlreadyEndedError();

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
          'DEPARTMENT_IT_SUBSTITUTE.ENDED',
          'DepartmentItSubstitute',
          id,
          {
            departmentId: current.department.id,
            substituteEmployeeId: current.substitute.id,
            endedAt: null,
            endCause: null,
          },
          {
            departmentId: current.department.id,
            substituteEmployeeId: current.substitute.id,
            endedAt: endedAt.toISOString(),
            endCause: 'REMOVED',
          },
        ),
      );

      return updated;
    });

    const usable = await this.employeeAccounts.get().findUsableItAdminEmployeeIds([ended.substitute.id]);

    return { ...ended, substituteUsable: usable.has(ended.substitute.id) };
  }

  async list(
    principal: AuthenticatedPrincipal,
    query: { departmentId?: string; state: 'ACTIVE' | 'ENDED' | 'ALL'; page: number; pageSize: number },
  ): Promise<Page<DepartmentItSubstituteView>> {
    const scopeMode = itSubstituteListScope(principal.roles);
    const readableDepartmentIds =
      scopeMode === 'IT_ADMIN_SCOPE'
        ? await this.departmentRecords.itAdminScopeOf(principal.employeeId, (ids) =>
            this.employeeAccounts.get().findUsableItAdminEmployeeIds(ids),
          )
        : undefined;

    const { items, total } = await this.repo.list({
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      state: query.state,
      ...(scopeMode === 'IT_ADMIN_SCOPE'
        ? { readableDepartmentIds, callerSubstituteEmployeeId: principal.employeeId }
        : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    const usable =
      items.length === 0
        ? new Set<string>()
        : await this.employeeAccounts
            .get()
            .findUsableItAdminEmployeeIds([
              ...new Set(items.map((item: DepartmentItSubstituteRecord) => item.substitute.id)),
            ]);

    return pageOf(
      items.map((item) => ({ ...item, substituteUsable: usable.has(item.substitute.id) })),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async lockAndReadCandidate(tx: DbTx, employeeId: string) {
    try {
      await this.employees.lock(tx, employeeId, 'UPDATE');
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) return null;
      throw error;
    }

    return this.employees.find(employeeId, tx);
  }

  private async isAccountUsableItAdmin(tx: DbTx, employeeId: string): Promise<boolean> {
    const account = await this.employeeAccounts.get().inspectEmployeeAccount(tx, employeeId);

    return account.usable && account.roles.includes('IT_ADMIN');
  }

  private async requireOrganization() {
    const record = await this.context.findOrganization();
    if (!record) throw new Error('Department IT substitutes were used before installation');

    return record;
  }
}
