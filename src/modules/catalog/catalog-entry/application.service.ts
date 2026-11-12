import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { EmptyState } from '../public/catalog.types';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { VendorDictionaryFactsService } from '../vendor-dictionary/vendor-dictionary-facts.service';
import { VendorRecordService, type EnsuredVendor } from '../vendor/vendor-record.service';
import {
  ApplicationDictionaryLineNotFoundError,
  ApplicationNotFoundError,
  ApplicationUpdateEmptyError,
} from './application.errors';
import {
  cleanApplicationDomains,
  cleanApplicationName,
  cleanNote,
  isCommunicationService,
  SIMILAR_APPLICATION_LIMIT,
  vendorSourceOf,
  type CommunicationAnswers,
} from './application.policy';
import { ApplicationRepo } from './application.repo';
import { ApplicationVendorLinkService } from './application-vendor-link.service';
import { ApplicationWriteGuards } from './application-write-guards.service';
import { ApplicationViewService } from './application-view.service';
import { applicationChangesOf, snapshot } from './application-state.policy';
import type { K2Recommendation } from './k2-recommendation.policy';
import type { ApplicationKind, ApplicationRecord, ApplicationView, DataSensitivity } from './application.types';

export interface DeclareApplicationInput {
  name: string;
  kind: ApplicationKind;
  vendorName?: string;
  dictionaryServiceLineId?: string;
  domains?: string[];
  dataSensitivity: DataSensitivity;
  communication: CommunicationAnswers & { note?: string | null };
  functionalGroupId?: string;
}

export interface UpdateApplicationInput {
  name?: string;
  domains?: string[];
  dataSensitivity?: DataSensitivity;
  communication?: Partial<CommunicationAnswers> & { note?: string | null };
  functionalGroupId?: string | null;
  dictionaryServiceLineId?: string | null;
}

/**
 * The application catalog the IT Admin keeps (`US-04-01`). Declaring or changing an application is one transaction:
 * the vendor and the functional group are found or checked, the application is written with the IT Admin who declares it
 * as the one responsible (`QĐ-111g`), a proposal to the dictionary is raised when the software is outside it, and the audit events are recorded.
 * A unique violation aborts the transaction, so it is caught outside it and mapped by the column it names.
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly vendors: VendorRecordService,
    private readonly dictionary: VendorDictionaryFactsService,
    private readonly vendorLinks: ApplicationVendorLinkService,
    private readonly views: ApplicationViewService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly guards: ApplicationWriteGuards,
  ) {}

  /** The guidance of an empty list: set only when there is not one application at all, not when a filter matched none. */
  async emptyState(): Promise<EmptyState | null> {
    if ((await this.applications.count()) > 0) return null;

    return { reason: 'NO_APPLICATIONS', nextStep: { step: 2, key: 'APPLICATIONS' } };
  }

  /**
   * Throws ApplicationNotFoundError. The similar tools are the other approved applications of the same functional group.
   * The recommendations are worked out when it is read and block nothing: a K2 plan is worth considering when three
   * different people hold seats on K1 plans of the software (`US-04-02` AC-9).
   */
  async get(id: string): Promise<{
    application: ApplicationView;
    similar: { id: string; name: string }[];
    similarTotal: number;
    recommendations: K2Recommendation[];
  }> {
    const record = await this.applications.find(id);
    if (!record) throw new ApplicationNotFoundError();
    const [application] = await this.views.withResponsible([record]);
    const similar = record.functionalGroup
      ? await this.applications.similarTo(record.functionalGroup.id, id, SIMILAR_APPLICATION_LIMIT)
      : { items: [], total: 0 };

    return {
      application,
      similar: similar.items,
      similarTotal: similar.total,
      recommendations: await this.views.recommendationsOf(id),
    };
  }

  /**
   * Declares an application. Throws the vendor errors of `vendorSourceOf`, the
   * name, domain and note errors of the policy,
   * ApplicationFunctionalGroupInvalidError, ApplicationDictionaryLineNotFoundError, ApplicationNameTakenError,
   * ApplicationDictionaryLineTakenError, ApplicationDictionaryLineMismatchError (a vendor of the group's name holds
   * another group) and ApplicationVendorGroupChangedError (a simultaneous change took the group first, `DB-03`).
   * `proposed` is true when the software is outside the dictionary.
   */
  async declare(
    actor: AuthenticatedPrincipal,
    input: DeclareApplicationInput,
  ): Promise<{ application: ApplicationView; proposed: boolean }> {
    const [application] = await this.views.withResponsible([await this.declareRecord(actor, input)]);

    return { application, proposed: vendorSourceOf(input).type === 'NAME' };
  }

  /** The same declaration, returning the record; with `outer` it is written in the caller's transaction (`US-05-20`). */
  async declareRecord(actor: AuthenticatedPrincipal, input: DeclareApplicationInput, outer?: DbTx) {
    const source = vendorSourceOf(input);
    const prepared = {
      source,
      name: cleanApplicationName(input.name),
      domains: cleanApplicationDomains(input.domains ?? []),
      note: cleanNote(input.communication.note),
      organizationId: await this.guards.requireOrganizationId(),
    };
    const write = (tx: DbTx): Promise<ApplicationRecord> => this.writeDeclaration(tx, actor, input, prepared);

    try {
      return await (outer ? write(outer) : this.runner.run(write));
    } catch (error) {
      throw this.guards.mapWriteError(error);
    }
  }

  /** The functional group is checked, the vendor is found or made, the application is written with the caller as the IT Admin responsible, and the audit says so. */
  private async writeDeclaration(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: DeclareApplicationInput,
    prepared: {
      source: ReturnType<typeof vendorSourceOf>;
      name: string;
      domains: string[];
      note: string | null;
      organizationId: string;
    },
  ): Promise<ApplicationRecord> {
    const { source, name, domains, note, organizationId } = prepared;
    const group = input.functionalGroupId ? await this.guards.requireActiveGroup(tx, input.functionalGroupId) : null;
    const { ensured, dictionaryServiceLineId } = await this.ensureVendor(tx, organizationId, source);

    const created = await this.applications.insert(tx, {
      organizationId,
      name,
      kind: input.kind,
      vendorId: ensured?.vendor.id ?? null,
      dictionaryServiceLineId,
      functionalGroupId: group?.id ?? null,
      // QĐ-111g: the IT Admin who declares the application answers for it; there is no field to choose another.
      responsibleItAdminEmployeeId: actor.employeeId,
      dataSensitivity: input.dataSensitivity,
      communication: {
        personToPersonMessaging: input.communication.personToPersonMessaging,
        callsOrMeetings: input.communication.callsOrMeetings,
        mailbox: input.communication.mailbox,
        isCommunicationService: isCommunicationService(input.communication),
        note,
      },
      domains,
    });
    await this.auditCreated(tx, actor, created, { ensured, source, name, domains, organizationId });

    return created;
  }

  /** The vendor the application is of: the one of the dictionary group, or one found or made by its name; none for software without one. */
  private async ensureVendor(
    tx: DbTx,
    organizationId: string,
    source: ReturnType<typeof vendorSourceOf>,
  ): Promise<{ ensured: EnsuredVendor | null; dictionaryServiceLineId: string | null }> {
    if (source.type === 'DICTIONARY') {
      const line = await this.dictionary.findLine(tx, source.lineId);
      if (!line) throw new ApplicationDictionaryLineNotFoundError();
      const ensured = await this.vendors.ensureForDictionaryGroup(tx, organizationId, {
        id: line.groupId,
        name: line.groupName,
      });

      return { ensured, dictionaryServiceLineId: line.lineId };
    }
    if (source.type === 'NAME') {
      return {
        ensured: await this.vendors.ensureByName(tx, organizationId, source.name),
        dictionaryServiceLineId: null,
      };
    }

    return { ensured: null, dictionaryServiceLineId: null };
  }

  private async auditCreated(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    created: ApplicationRecord,
    made: {
      ensured: EnsuredVendor | null;
      source: ReturnType<typeof vendorSourceOf>;
      name: string;
      domains: string[];
      organizationId: string;
    },
  ): Promise<void> {
    const { ensured, organizationId } = made;
    if (ensured?.created) {
      await this.audit.record(
        tx,
        catalogAuditEvent(actor, organizationId, 'VENDOR.CREATED', 'Vendor', ensured.vendor.id, null, {
          name: ensured.vendor.name,
          dictionaryGroupId: ensured.vendor.dictionaryGroupId,
        }),
      );
    }
    if (ensured?.adopted) {
      await this.vendorLinks.recordAdopted(
        tx,
        actor,
        organizationId,
        ensured.vendor.id,
        ensured.vendor.dictionaryGroupId,
      );
    }
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'APPLICATION.CREATED',
        'Application',
        created.id,
        null,
        snapshot(created),
      ),
    );
    if (made.source.type === 'NAME') {
      await this.vendorLinks.raiseProposal(tx, actor, {
        organizationId,
        name: made.name,
        domains: made.domains,
        sourceApplicationId: created.id,
      });
    }
  }

  /**
   * Changes an application. Throws ApplicationNotFoundError, ApplicationUpdateEmptyError, the validation and reference
   * errors of `declare`, and ApplicationDictionaryLineMismatchError. A change that changes nothing is a no-op.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: UpdateApplicationInput): Promise<ApplicationView> {
    if (Object.values(input).every((value) => value === undefined)) throw new ApplicationUpdateEmptyError();
    const cleaned = {
      name: input.name === undefined ? undefined : cleanApplicationName(input.name),
      domains: input.domains === undefined ? undefined : cleanApplicationDomains(input.domains),
      note: input.communication?.note === undefined ? undefined : cleanNote(input.communication.note),
    };
    const organizationId = await this.guards.requireOrganizationId();

    try {
      const record = await this.runner.run((tx) => this.updateIn(tx, actor, id, input, { cleaned, organizationId }));

      return (await this.views.withResponsible([record]))[0];
    } catch (error) {
      throw this.guards.mapWriteError(error);
    }
  }

  private async updateIn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    input: UpdateApplicationInput,
    ctx: { cleaned: { name?: string; domains?: string[]; note?: string | null }; organizationId: string },
  ): Promise<ApplicationRecord> {
    const { organizationId } = ctx;
    const current = await this.applications.lock(tx, id);
    if (!current) throw new ApplicationNotFoundError();
    const changes = applicationChangesOf(current, input, ctx.cleaned);

    // The references that changed are checked in this order: the functional group, the dictionary line.
    if (changes.functionalGroupId) await this.guards.requireActiveGroup(tx, changes.functionalGroupId);
    const adoptedGroup = changes.dictionaryServiceLineId
      ? await this.vendorLinks.requireLine(tx, organizationId, current, changes.dictionaryServiceLineId)
      : null;
    if (Object.keys(changes).length === 0) return current;

    const updated = await this.applications.update(tx, id, changes);
    if (adoptedGroup) {
      await this.vendorLinks.recordAdopted(tx, actor, organizationId, adoptedGroup.vendorId, adoptedGroup.groupId);
    }
    await this.audit.record(
      tx,
      catalogAuditEvent(
        actor,
        organizationId,
        'APPLICATION.UPDATED',
        'Application',
        id,
        snapshot(current),
        snapshot(updated),
      ),
    );

    return updated;
  }
}
