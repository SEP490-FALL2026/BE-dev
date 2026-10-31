import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestNoDepartmentError,
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestPlanNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { mayRequest, policyFor } from '../access-request/access-request.policy';
import { beneficiaryCountOfContent, contentOf, draftSnapshot, toContentJson } from './request-draft-content.mapper';
import type { AccessRequestDraftWire, DraftSaveBody } from './request-draft.dto';
import { draftVerdict, REQUEST_TYPE_OF_KIND } from '../request-draft/request-draft.policy';
import { RequestDraftRepo, type DraftRow } from '../request-draft/request-draft.repo';

/**
 * The drafts of paid requests: a person saves what they cannot yet send (their department has no Cost Center), lists
 * what they saved, and deletes it; sending a draft is `RequestDraftSubmitService`. Saving runs no gate: it checks that the person
 * belongs to a department and that the plan exists, which are what a row of the table needs, and writes the draft with no Cost Center,
 * no moment it was sent, no price, no step, no check and no commitment. A draft is the sender's alone: it is never listed, read or
 * decided as a request. Nothing is changed in a draft: to change one, delete it and save it again. The Super Admin sends no request, so
 * keeps no draft of one, judged here and not by the route.
 */
@Injectable()
export class RequestDraftService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly drafts: RequestDraftRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNoDepartmentError and AccessRequestPlanNotFoundError. */
  async save(actor: AuthenticatedPrincipal, body: DraftSaveBody): Promise<AccessRequestDraftWire> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();

    return this.runner.run(async (tx) => {
      // The sender is relied on until commit, as when a request is sent: they cannot leave the company between the check and the write.
      await this.organization.lockEmployeeForShare(tx, actor.employeeId);
      const employee = await this.organization.getEmployee(actor.employeeId, tx);
      if (!employee) throw new AccessRequestNoDepartmentError();
      const today = await this.organization.businessToday(new Date(), tx);
      const unit = (await this.organization.getOwningUnits([actor.employeeId], today, tx)).get(actor.employeeId);
      if (!unit) throw new AccessRequestNoDepartmentError();
      const [target] = await this.catalog.findPlanSeatTargets([body.planId], tx);
      if (!target) throw new AccessRequestPlanNotFoundError();

      const saved = await this.drafts.insert(tx, {
        organizationId: employee.organizationId,
        // A request of the type SERVICE_ACCOUNT must have its detail row when the transaction commits (`access_requests_service_account_detail`)
        // and the detail is never deleted, while a draft has none: it is saved as the plain request it is until it is sent, and the
        // kind it will be is kept with its content (`policy.draft.kind`); sending it gives the row its type with the detail.
        type: body.kind === 'SERVICE_ACCOUNT' ? 'GRANT' : REQUEST_TYPE_OF_KIND[body.kind],
        // The branch the plan leads to; the policy is fixed, with the SLA of the day, only when the draft is sent.
        branch: policyFor(target.applicationKind, 1).branch,
        planId: body.planId,
        requesterEmployeeId: actor.employeeId,
        departmentId: unit.departmentId,
        businessReason: body.businessReason,
        termMonths: body.termMonths,
        projectLabel: body.projectLabel ?? null,
        content: toContentJson(body),
        createdByAppUserId: actor.appUserId,
      });
      const content = contentOf(saved);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          employee.organizationId,
          'ACCESS_REQUEST.DRAFT_SAVED',
          'ACCESS_REQUEST',
          saved.id,
          draftSnapshot(saved, content),
        ),
      );

      return this.wire(saved);
    });
  }

  /** The drafts of the caller only, the newest first and then by id. Throws AccessRequestSuperAdminCannotRequestError. */
  async list(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<AccessRequestDraftWire>> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const { items, total } = await this.drafts.pageOf(actor.employeeId, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(
      items.map((row) => this.wire(row)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * The draft of the caller by its id, for the read of a request (`accessRequestGet`). A request that was sent, a draft of
   * somebody else and an id that is not there are all null: one answer, so nothing says whether another person's draft exists.
   */
  async readOwn(actor: AuthenticatedPrincipal, id: string): Promise<AccessRequestDraftWire | null> {
    const row = await this.drafts.find(id);

    return row !== null && draftVerdict(row, actor.employeeId) === 'OK' ? this.wire(row) : null;
  }

  /**
   * Deletes the draft and what hangs from it in one transaction, and says in the Audit Trail what it was. A request that is not the
   * caller's is answered as one that does not exist; one that is the caller's and was sent already is not a draft.
   * Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNotFoundError and AccessRequestNotDraftError.
   */
  async delete(actor: AuthenticatedPrincipal, id: string): Promise<AccessRequestDraftWire> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();

    return this.runner.run(async (tx) => {
      const verdict = await this.drafts.lockOwned(tx, id, actor.employeeId);
      if (verdict === 'NOT_FOUND') throw new AccessRequestNotFoundError();
      if (verdict === 'NOT_DRAFT') throw new AccessRequestNotDraftError();
      const row = await this.drafts.find(id, tx);
      if (!row) throw new AccessRequestNotFoundError();

      await this.drafts.delete(tx, id);
      await this.audit.record(tx, {
        ...accessRequestAuditEvent(actor, row.organizationId, 'ACCESS_REQUEST.DRAFT_DELETED', 'ACCESS_REQUEST', id, {}),
        before: draftSnapshot(row, contentOf(row)),
        after: null,
      });

      return this.wire(row);
    });
  }

  private wire(row: DraftRow): AccessRequestDraftWire {
    if (row.planId === null) throw new Error(`The draft ${row.id} is not a draft of a request.`);
    const content = contentOf(row);

    return {
      id: row.id,
      kind: content.kind,
      departmentId: row.departmentId,
      planId: row.planId,
      beneficiaryCount: beneficiaryCountOfContent(content),
      createdAt: row.savedAt.toISOString(),
    };
  }
}
