import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditValue } from '../../audit/public/audit.types';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { searchKey } from '../vendor-dictionary/vendor-matcher.policy';
import { VendorNotFoundError } from '../vendor/vendor.errors';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { WorkspaceNotFoundError, WorkspaceStaleError, WorkspaceTextInvalidError } from './workspace.errors';
import { assertResponsible, assertWithinLimits, cleanWorkspaceText } from './workspace.policy';
import { WorkspaceRepo } from './workspace.repo';
import { WorkspaceViewService } from './workspace-view.service';
import type { WorkspaceChanges, WorkspaceRecord } from './workspace.types';

export type WorkspaceFlagFilter = 'ADMINS_BELOW_MINIMUM' | 'NO_OWNER_EMAIL' | 'NO_RESPONSIBLE';

/** The fields a change names; the emergency account and every text come as the caller wrote them and are cleaned here. */
export interface WorkspaceChangeInput {
  expectedUpdatedAt: Date;
  name?: string;
  ownerAccountEmail?: string | null;
  adminNote?: string | null;
  ownerLimit?: number | null;
  adminLimit?: number | null;
  ownerTransferProcedure?: string | null;
  emergencyAccount?: {
    identity: string;
    occupiesSeat: boolean;
    holderEmployeeId: string;
    lastReviewedOn: string;
  } | null;
}

/** What an audit event keeps of a workspace's profile: the values, never a secret. */
const profileOf = (workspace: WorkspaceRecord): { [key: string]: AuditValue } => ({
  name: workspace.name,
  ownerAccountEmail: workspace.ownerAccountEmail,
  ownerLimit: workspace.ownerLimit,
  adminLimit: workspace.adminLimit,
  ownerTransferProcedure: workspace.ownerTransferProcedure,
  emergencyIdentity: workspace.emergencyAccount?.identity ?? null,
  emergencyOccupiesSeat: workspace.emergencyAccount?.occupiesSeat ?? null,
  emergencyHolderEmployeeId: workspace.emergencyAccount?.holderEmployeeId ?? null,
  emergencyLastReviewedOn: workspace.emergencyAccount?.lastReviewedOn ?? null,
  adminNote: workspace.adminNote,
});

/**
 * The workspaces the company holds at its vendors (`QĐ-115c`): the list and the detail every IT Admin and Finance read, the creation by any
 * IT Admin (who becomes the one who answers for it, `QĐ-118d`), and the change of its profile by that IT Admin alone (`QĐ-118f`). Who administers it
 * and who answers for it have services of their own.
 *
 * Lock order: when changing the emergency account, tier 1 `employees` `FOR SHARE` (and account second) via `requireItAdmin` BEFORE tier 5b
 * `workspaces` `FOR UPDATE` (`docs/rules/database-business.md`).
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly repo: WorkspaceRepo,
    private readonly views: WorkspaceViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * A page of workspaces. With a flag the whole list is judged on the accounts (the flags are not in the database) and cut into the page here: the
   * company holds a handful of workspaces, one for each vendor.
   */
  async list(input: {
    vendorId?: string | undefined;
    flag?: WorkspaceFlagFilter | undefined;
    page: number;
    pageSize: number;
  }) {
    const window = { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
    if (input.flag === undefined) {
      const { items, total } = await this.repo.page({ vendorId: input.vendorId }, window);

      return { items: await this.views.summaries(items), ...this.pagination(input, total) };
    }
    const all = await this.repo.page({ vendorId: input.vendorId }, 'all');
    const summaries = (await this.views.summaries(all.items)).filter((summary) => summary.flags.includes(input.flag!));

    return {
      items: summaries.slice(window.skip, window.skip + window.take),
      ...this.pagination(input, summaries.length),
    };
  }

  private pagination(input: { page: number; pageSize: number }, totalItems: number) {
    return {
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / input.pageSize),
      },
    };
  }

  /** Throws WorkspaceNotFoundError. */
  async get(id: string) {
    const record = await this.repo.find(id);
    if (!record) throw new WorkspaceNotFoundError();

    return this.views.detail(record);
  }

  /** The workspace of a vendor made by an IT Admin, who answers for it. Throws VendorNotFoundError, WorkspaceNameTakenError, WorkspaceTextInvalidError. */
  async create(
    actor: AuthenticatedPrincipal,
    input: { vendorId: string; name: string; ownerAccountEmail?: string | undefined; adminNote?: string | undefined },
  ) {
    const adminNote = cleanWorkspaceText(input.adminNote);
    const ownerAccountEmail = cleanWorkspaceText(input.ownerAccountEmail);
    const name = cleanWorkspaceText(input.name);
    if (name === null) throw new WorkspaceTextInvalidError();
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspaces were used before installation');

    const id = await this.runner.run(async (tx) => {
      if ((await this.repo.findVendorName(tx, input.vendorId)) === null) throw new VendorNotFoundError();
      const created = await this.repo.insert(tx, {
        organizationId: organization.id,
        vendorId: input.vendorId,
        name,
        normalizedName: searchKey(name),
        ownerAccountEmail,
        adminNote,
        responsibleItAdminEmployeeId: actor.employeeId,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'WORKSPACE.CREATED', 'Workspace', created, null, {
          vendorId: input.vendorId,
          name,
          ownerAccountEmail,
          adminNote,
          responsibleItAdminEmployeeId: actor.employeeId,
        }),
      );

      return created;
    });

    return this.get(id);
  }

  /**
   * Changes the profile of a workspace on the version the caller read. Only the IT Admin who answers for it does. Throws WorkspaceNotFoundError, WorkspaceNotResponsibleError, WorkspaceStaleError, WorkspaceNameTakenError,
   * WorkspaceTextInvalidError, WorkspaceLimitExceededError and WorkspaceAdminNotItAdminError.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: WorkspaceChangeInput) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspaces were used before installation');
    const changes = this.cleaned(input);

    await this.runner.run(async (tx) => {
      if (changes.emergencyAccount) await this.views.requireItAdmin(tx, changes.emergencyAccount.holderEmployeeId);
      const current = await this.repo.lock(tx, id);
      if (!current) throw new WorkspaceNotFoundError();
      assertResponsible(actor.employeeId, current.responsibleItAdminEmployeeId);
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw new WorkspaceStaleError(current.updatedAt);
      assertWithinLimits(
        current.admins,
        changes.ownerLimit === undefined ? current.ownerLimit : changes.ownerLimit,
        changes.adminLimit === undefined ? current.adminLimit : changes.adminLimit,
      );

      await this.repo.update(tx, id, {
        ...changes,
        ...(changes.name === undefined ? {} : { normalizedName: searchKey(changes.name) }),
      });
      const after = await this.repo.find(id, tx);
      if (!after) throw new WorkspaceNotFoundError();
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'WORKSPACE.UPDATED',
          'Workspace',
          id,
          profileOf(current),
          profileOf(after),
        ),
      );
    });

    return this.get(id);
  }

  /** The texts of a change cleaned; a field the change does not name is absent. */
  private cleaned(input: WorkspaceChangeInput): WorkspaceChanges {
    const changes: WorkspaceChanges = {};
    const set = <K extends keyof WorkspaceChanges>(key: K, value: WorkspaceChanges[K] | undefined): void => {
      if (value !== undefined) changes[key] = value;
    };
    set('name', this.cleanedName(input.name));
    set('ownerAccountEmail', cleanedText(input.ownerAccountEmail));
    set('adminNote', cleanedText(input.adminNote));
    set('ownerLimit', input.ownerLimit);
    set('adminLimit', input.adminLimit);
    set('ownerTransferProcedure', cleanedText(input.ownerTransferProcedure));
    set('emergencyAccount', this.cleanedEmergency(input.emergencyAccount));

    return changes;
  }

  private cleanedName(name: string | undefined): string | undefined {
    if (name === undefined) return undefined;
    const cleaned = cleanWorkspaceText(name);
    if (cleaned === null) throw new WorkspaceTextInvalidError();

    return cleaned;
  }

  private cleanedEmergency(account: WorkspaceChangeInput['emergencyAccount']): WorkspaceChanges['emergencyAccount'] {
    if (account === undefined || account === null) return account;
    const identity = cleanWorkspaceText(account.identity);
    if (identity === null) throw new WorkspaceTextInvalidError();

    return { ...account, identity };
  }
}

/** A text of a change: not named stays absent, blanks become null. */
function cleanedText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : cleanWorkspaceText(value);
}
