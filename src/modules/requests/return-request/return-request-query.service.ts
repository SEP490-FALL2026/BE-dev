import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ReturnDetailWire, ReturnSummaryWire } from './return-request.dto';
import { ReturnRequestRefusedError } from './return-request.errors';
import { mayReadReturn } from './return-request.policy';
import { ReturnRequestRepo, type ReturnRequestRecord, type ReturnRequestSummaryRecord } from './return-request.repo';

/**
 * Reading the returns (`US-05-13` AC-3): a return is a durable record that the holder, the person who sent it, the head of the
 * department of the holder and the IT Admin read; nobody else sees that it exists. A list answers a fixed number of statements
 * however many rows it has: the names, the departments and the plans of a page are read together, once each.
 */
@Injectable()
export class ReturnRequestQueryService {
  constructor(
    private readonly returns: ReturnRequestRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** Throws ReturnRequestRefusedError (`NOT_FOUND`, also for a return the caller has no part in). */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<ReturnDetailWire> {
    const record = await this.returns.findById(id);
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);
    if (
      !record ||
      !mayReadReturn({
        actorEmployeeId: actor.employeeId,
        roles: actor.roles,
        holderEmployeeId: record.holderEmployeeId,
        requestedByEmployeeId: record.requestedByEmployeeId,
        returnDepartmentId: record.departmentId,
        actorHeadedDepartmentId: headed?.departmentId ?? null,
      })
    ) {
      throw new ReturnRequestRefusedError('NOT_FOUND');
    }

    return this.detail(record);
  }

  async list(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number; state?: ReturnRequestRecord['state']; assignmentId?: string },
  ): Promise<Page<ReturnSummaryWire>> {
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);
    const { items, total } = await this.returns.page({
      scope: actor.roles.includes('IT_ADMIN')
        ? { all: true }
        : { employeeId: actor.employeeId, headedDepartmentId: headed?.departmentId ?? null },
      ...(query.state ? { state: query.state } : {}),
      ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.summaries(items), total, query.page, query.pageSize);
  }

  /** The record of a return the caller just sent or confirmed, as its detail. */
  async detail(record: ReturnRequestRecord): Promise<ReturnDetailWire> {
    const [summary] = await this.summaries([record]);
    const people = await this.organizationReads.getEmployees(
      record.handoverConfirmedByEmployeeId ? [record.handoverConfirmedByEmployeeId] : [],
    );
    const confirmer = people[0];

    return {
      ...summary,
      reason: record.reason,
      revocationNote: record.revocationNote,
      originRequestId: record.originRequestId,
      handoverConfirmedBy: confirmer
        ? { employeeId: confirmer.id, employeeCode: confirmer.employeeCode, fullName: confirmer.fullName }
        : null,
      handoverConfirmedAt: record.handoverConfirmedAt?.toISOString() ?? null,
      failureReason: record.failureReason,
    };
  }

  private async summaries(rows: readonly ReturnRequestSummaryRecord[]): Promise<ReturnSummaryWire[]> {
    if (rows.length === 0) return [];
    const [people, departments, plans] = await Promise.all([
      this.organizationReads.getEmployees([
        ...new Set(rows.flatMap((row) => [row.holderEmployeeId, row.requestedByEmployeeId])),
      ]),
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))]),
      this.catalog.getPlanSummaries([...new Set(rows.map((row) => row.planId))]),
    ]);
    const person = (id: string) => {
      const found = people.find((candidate) => candidate.id === id);
      if (!found) throw new Error(`The employee ${id} of a return does not exist.`);

      return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
    };

    return rows.map((row) => {
      const department = departments.find((candidate) => candidate.id === row.departmentId);
      const plan = plans.find((candidate) => candidate.planId === row.planId);
      if (!department || !plan) throw new Error(`The return ${row.id} points at a missing record.`);

      return {
        id: row.id,
        state: row.state,
        source: row.source,
        assignmentId: row.assignmentId,
        plan,
        holder: person(row.holderEmployeeId),
        requestedBy: person(row.requestedByEmployeeId),
        department: { id: department.id, code: department.code, name: department.name },
        requestedOn: row.requestedOn,
        handover: {
          required: row.handoverRequired,
          dueOn: row.handoverDueOn,
          confirmed: row.handoverConfirmedAt !== null,
          flagged: row.handoverFlagged,
        },
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
      };
    });
  }
}
