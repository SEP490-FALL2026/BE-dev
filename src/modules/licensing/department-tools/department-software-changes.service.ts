import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { ToolsDepartmentNotFoundError } from '../public/licensing.errors';
import { DepartmentSoftwareAccessService } from './department-software-access.service';
import type { SoftwareEntryWire } from './department-software.dto';
import { DepartmentSoftwareViewService } from './department-software-view.service';
import {
  DepartmentSoftwareAlreadyListedError,
  DepartmentSoftwareEntryNotFoundError,
} from './department-software.errors';
import { entryKey, type DepartmentSoftwareItem } from './department-software.policy';
import { DepartmentSoftwareRepo } from './department-software.repo';
import type { SoftwareEntry, SoftwareEntryDraft } from './department-software.types';

export interface SoftwareListChange {
  add: readonly SoftwareEntryDraft[];
  remove: readonly string[];
}

const place = (item: DepartmentSoftwareItem) => ({ applicationId: item.applicationId, planId: item.planId });

/**
 * What the IT Admin in charge changes in the list of software of a department, in one transaction (`QĐ-110s`, SPEC P16): the entries to take
 * out go first, then the places to add, so one call can replace a place with a new note. Every place to add must be what the catalog offers; one
 * that is already listed, or an entry that is not in this department, refuses the whole call and nothing is written. The unique index decides a
 * duplicate (`ON CONFLICT DO NOTHING` says what was written), so two IT Admins who add the same place together leave one entry and a refusal for
 * the other. The department is held `FOR SHARE` until commit. Each place added or taken out is one event of the Audit Trail, without its note.
 */
@Injectable()
export class DepartmentSoftwareChangesService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: DepartmentSoftwareRepo,
    private readonly access: DepartmentSoftwareAccessService,
    private readonly view: DepartmentSoftwareViewService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError, DepartmentSoftwareNotInCatalogError,
   * DepartmentSoftwareEntryNotFoundError and DepartmentSoftwareAlreadyListedError.
   */
  async change(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    change: SoftwareListChange,
  ): Promise<{ added: SoftwareEntryWire[]; removed: string[] }> {
    await this.access.assertMayChange(actor, departmentId);
    await this.view.assertInCatalog(change.add);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The list of software of a department was changed before installation');

    const result = await this.runner.run(async (tx) => {
      if (!(await this.organizationReads.lockDepartmentShared(tx, departmentId)))
        throw new ToolsDepartmentNotFoundError();
      const removed = await this.takeOut(tx, departmentId, change.remove);
      const added = await this.putIn(tx, organization.id, departmentId, actor.appUserId, change.add);
      for (const entry of removed) {
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            organization.id,
            'DEPARTMENT_SOFTWARE.ENTRY_REMOVED',
            'DepartmentSoftwareEntry',
            entry.id,
            {
              departmentId,
              ...place(entry),
            },
            null,
          ),
        );
      }
      for (const entry of added) {
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            organization.id,
            'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
            'DepartmentSoftwareEntry',
            entry.id,
            null,
            {
              departmentId,
              ...place(entry),
            },
          ),
        );
      }

      return { added, removed: removed.map((entry) => entry.id) };
    });

    return { added: await this.view.entries(result.added), removed: result.removed };
  }

  /**
   * The tick "add to the list of the department" of the link of a request to the catalog (`QĐ-111c`, SPEC FE IN-1), in the transaction of the
   * caller: the place goes in the list if it is not there, and the answer says which (`added`) and the entry either way. A place already listed is not
   * an error here (the caller links software that may be listed), and it does not abort the transaction of the caller. What the catalog does not
   * offer is refused. The caller has authorized the IT Admin on the request, whose department this is; this does not judge the scope again.
   * Throws DepartmentSoftwareNotInCatalogError and ToolsDepartmentNotFoundError.
   */
  async addFromCatalogLink(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { departmentId: string; applicationId: string; planId: string | null; note: string | null },
  ): Promise<{ entryId: string; added: boolean }> {
    const item = { applicationId: input.applicationId, planId: input.planId };
    await this.view.assertInCatalog([item], tx);
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('The list of software of a department was changed before installation');
    if (!(await this.organizationReads.lockDepartmentShared(tx, input.departmentId)))
      throw new ToolsDepartmentNotFoundError();
    const { entry, created } = await this.ensureEntry(tx, actor, organization.id, input.departmentId, item, input.note);

    return { entryId: entry.id, added: created };
  }

  /**
   * The entry of the place in the list, written now (and audited) or already there. It is read again once when the entry it found beside the
   * insert was taken out meanwhile: a second miss is a fault of timing that is reported, not hidden. Used by the acceptance of a proposal and the link.
   */
  async ensureEntry(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    departmentId: string,
    item: DepartmentSoftwareItem,
    note: string | null,
  ): Promise<{ entry: SoftwareEntry; created: boolean }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const [written] = await this.repo.insertEntries(tx, {
        organizationId,
        departmentId,
        addedByAppUserId: actor.appUserId,
        items: [{ ...item, note }],
      });
      if (written) {
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            organizationId,
            'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
            'DepartmentSoftwareEntry',
            written.id,
            null,
            {
              departmentId,
              ...place(item),
            },
          ),
        );

        return { entry: written, created: true };
      }
      const existing = await this.repo.findEntryByPlace(tx, departmentId, item);
      if (existing) return { entry: existing, created: false };
    }
    throw new Error('The place of the list of software could be neither written nor found in it.');
  }

  private async takeOut(tx: DbTx, departmentId: string, ids: readonly string[]): Promise<SoftwareEntry[]> {
    if (ids.length === 0) return [];
    const found = await this.repo.findEntries(tx, departmentId, ids);
    const known = new Set(found.map((entry) => entry.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new DepartmentSoftwareEntryNotFoundError(missing);
    // Another call may have taken one out between the read and the delete: the count says so, and nothing is kept.
    if ((await this.repo.deleteEntries(tx, departmentId, ids)) !== ids.length)
      throw new DepartmentSoftwareEntryNotFoundError(ids);

    return found;
  }

  private async putIn(
    tx: DbTx,
    organizationId: string,
    departmentId: string,
    addedByAppUserId: string,
    items: readonly SoftwareEntryDraft[],
  ): Promise<SoftwareEntry[]> {
    if (items.length === 0) return [];
    const written = await this.repo.insertEntries(tx, { organizationId, departmentId, addedByAppUserId, items });
    const writtenKeys = new Set(written.map(entryKey));
    const skipped = items.filter((item) => !writtenKeys.has(entryKey(item)));
    if (skipped.length > 0) throw new DepartmentSoftwareAlreadyListedError(skipped.map(place));

    return written;
  }
}
