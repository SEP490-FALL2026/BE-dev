import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import { PlanLookupService } from '../plan/plan-lookup.service';
import { recommendK2, type K2Recommendation } from '../subscription/seat-guard.policy';
import { SeatOccupancyRegistry } from '../subscription/seat-occupancy.registry';
import type { EmptyState } from '../catalog.types';
import { FunctionalGroupLookupService } from '../functional-group/functional-group-lookup.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { VendorDictionaryLookupService } from '../vendor-dictionary/vendor-dictionary-lookup.service';
import { VendorDirectoryService, type EnsuredVendor } from '../vendor/vendor-directory.service';
import {
  ApplicationBusinessOwnerInvalidError,
  ApplicationDictionaryLineNotFoundError,
  ApplicationDictionaryLineMismatchError,
  ApplicationDictionaryLineTakenError,
  ApplicationFunctionalGroupInvalidError,
  ApplicationNameTakenError,
  ApplicationNotFoundError,
  ApplicationUpdateEmptyError,
} from './application.errors';
import {
  cleanApplicationDomains,
  cleanApplicationName,
  cleanNote,
  isCommunicationService,
  replacementRequired,
  SIMILAR_APPLICATION_LIMIT,
  vendorSourceOf,
  type CommunicationAnswers,
} from './application.policy';
import { ApplicationRepo } from './application.repo';
import { ApplicationVendorLinkService } from './application-vendor-link.service';
import { mergeCommunication, sameCommunication, sameList, snapshot } from './application.state';
import type {
  ApplicationChanges,
  ApplicationKind,
  ApplicationRecord,
  ApplicationView,
  BusinessOwnerView,
  DataSensitivity,
} from './application.types';

export interface DeclareApplicationInput {
  name: string;
  kind: ApplicationKind;
  vendorName?: string;
  dictionaryServiceLineId?: string;
  domains?: string[];
  dataSensitivity: DataSensitivity;
  businessOwnerEmployeeId: string;
  communication: CommunicationAnswers & { note?: string | null };
  functionalGroupId?: string;
}

export interface UpdateApplicationInput {
  name?: string;
  domains?: string[];
  dataSensitivity?: DataSensitivity;
  businessOwnerEmployeeId?: string;
  communication?: Partial<CommunicationAnswers> & { note?: string | null };
  functionalGroupId?: string | null;
  dictionaryServiceLineId?: string | null;
}

/**
 * The application catalog the IT Admin keeps (`US-04-01`). Declaring or changing an application is one transaction:
 * the Business Owner is locked and checked, the vendor and the functional group are found or checked, the application
 * is written, a proposal to the dictionary is raised when the software is outside it, and the audit events are recorded.
 * A unique violation aborts the transaction, so it is caught outside it and mapped by the column it names.
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly vendors: VendorDirectoryService,
    private readonly functionalGroups: FunctionalGroupLookupService,
    private readonly dictionary: VendorDictionaryLookupService,
    private readonly vendorLinks: ApplicationVendorLinkService,
    private readonly organization: OrganizationService,
    private readonly plans: PlanLookupService,
    private readonly occupancy: SeatOccupancyRegistry,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
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
    const [application] = await this.withOwners([record]);
    const similar = record.functionalGroup
      ? await this.applications.similarTo(record.functionalGroup.id, id, SIMILAR_APPLICATION_LIMIT)
      : { items: [], total: 0 };

    return {
      application,
      similar: similar.items,
      similarTotal: similar.total,
      recommendations: await this.recommendationsOf(id),
    };
  }

  /**
   * Declares an application. Throws the vendor errors of `vendorSourceOf`, the
   * name, domain and note errors of the policy, ApplicationBusinessOwnerInvalidError,
   * ApplicationFunctionalGroupInvalidError, ApplicationDictionaryLineNotFoundError, ApplicationNameTakenError and
   * ApplicationDictionaryLineTakenError. `proposed` is true when the software is outside the dictionary.
   */
  async declare(
    actor: AuthenticatedPrincipal,
    input: DeclareApplicationInput,
  ): Promise<{ application: ApplicationView; proposed: boolean }> {
    const [application] = await this.withOwners([await this.declareRecord(actor, input)]);

    return { application, proposed: vendorSourceOf(input).type === 'NAME' };
  }

  /** The same declaration, returning the record; with `outer` it is written in the caller's transaction (`US-05-20`). */
  async declareRecord(actor: AuthenticatedPrincipal, input: DeclareApplicationInput, outer?: DbTx) {
    const source = vendorSourceOf(input);
    const name = cleanApplicationName(input.name);
    const domains = cleanApplicationDomains(input.domains ?? []);
    const note = cleanNote(input.communication.note);
    const kind = input.kind;
    const communication = {
      personToPersonMessaging: input.communication.personToPersonMessaging,
      callsOrMeetings: input.communication.callsOrMeetings,
      mailbox: input.communication.mailbox,
      isCommunicationService: isCommunicationService(input.communication),
      note,
    };
    const organizationId = await this.requireOrganizationId();

    const write = async (tx: DbTx): Promise<ApplicationRecord> => {
      {
        await this.requireWorkingOwner(tx, input.businessOwnerEmployeeId);
        const group = input.functionalGroupId ? await this.requireActiveGroup(tx, input.functionalGroupId) : null;

        let ensured: EnsuredVendor | null = null;
        let dictionaryServiceLineId: string | null = null;
        if (source.type === 'DICTIONARY') {
          const line = await this.dictionary.findLine(tx, source.lineId);
          if (!line) throw new ApplicationDictionaryLineNotFoundError();
          ensured = await this.vendors.ensureForDictionaryGroup(tx, organizationId, {
            id: line.groupId,
            name: line.groupName,
          });
          dictionaryServiceLineId = line.lineId;
        } else if (source.type === 'NAME') {
          ensured = await this.vendors.ensureByName(tx, organizationId, source.name);
        }

        const created = await this.applications.insert(tx, {
          organizationId,
          name,
          kind,
          vendorId: ensured?.vendor.id ?? null,
          dictionaryServiceLineId,
          functionalGroupId: group?.id ?? null,
          businessOwnerEmployeeId: input.businessOwnerEmployeeId,
          dataSensitivity: input.dataSensitivity,
          communication,
          domains,
        });
        await this.applications.openOwnerPeriod(tx, {
          applicationId: created.id,
          employeeId: input.businessOwnerEmployeeId,
          assignedByAppUserId: actor.appUserId,
        });
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
        if (source.type === 'NAME') {
          await this.vendorLinks.raiseProposal(tx, actor, {
            organizationId,
            name,
            domains,
            sourceApplicationId: created.id,
          });
        }

        return created;
      }
    };

    try {
      return await (outer ? write(outer) : this.runner.run(write));
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * Changes an application. Throws ApplicationNotFoundError, ApplicationUpdateEmptyError, the validation and reference
   * errors of `declare`, and ApplicationDictionaryLineMismatchError. A change that changes nothing is a no-op.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: UpdateApplicationInput): Promise<ApplicationView> {
    if (Object.values(input).every((value) => value === undefined)) throw new ApplicationUpdateEmptyError();
    const name = input.name === undefined ? undefined : cleanApplicationName(input.name);
    const domains = input.domains === undefined ? undefined : cleanApplicationDomains(input.domains);
    const note = input.communication?.note === undefined ? undefined : cleanNote(input.communication.note);
    const organizationId = await this.requireOrganizationId();

    try {
      const record = await this.runner.run(async (tx) => {
        const current = await this.applications.lock(tx, id);
        if (!current) throw new ApplicationNotFoundError();
        const changes: ApplicationChanges = {};
        let adoptedGroup: { vendorId: string; groupId: string } | null = null;

        if (name !== undefined && name !== current.name) changes.name = name;
        if (domains !== undefined && !sameList(domains, current.domains)) changes.domains = domains;
        if (input.dataSensitivity !== undefined && input.dataSensitivity !== current.dataSensitivity) {
          changes.dataSensitivity = input.dataSensitivity;
        }
        if (
          input.businessOwnerEmployeeId !== undefined &&
          input.businessOwnerEmployeeId !== current.businessOwnerEmployeeId
        ) {
          await this.requireWorkingOwner(tx, input.businessOwnerEmployeeId);
          changes.businessOwnerEmployeeId = input.businessOwnerEmployeeId;
        }
        if (
          input.functionalGroupId !== undefined &&
          input.functionalGroupId !== (current.functionalGroup?.id ?? null)
        ) {
          if (input.functionalGroupId !== null) await this.requireActiveGroup(tx, input.functionalGroupId);
          changes.functionalGroupId = input.functionalGroupId;
        }
        if (
          input.dictionaryServiceLineId !== undefined &&
          input.dictionaryServiceLineId !== current.dictionaryServiceLineId
        ) {
          if (input.dictionaryServiceLineId !== null) {
            adoptedGroup = await this.vendorLinks.requireLine(tx, current, input.dictionaryServiceLineId);
          }
          changes.dictionaryServiceLineId = input.dictionaryServiceLineId;
        }
        if (input.communication !== undefined) {
          const merged = mergeCommunication(current.communication, input.communication, note);
          if (!sameCommunication(merged, current.communication)) changes.communication = merged;
        }
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.applications.update(tx, id, changes);
        if (adoptedGroup) {
          await this.vendorLinks.recordAdopted(tx, actor, organizationId, adoptedGroup.vendorId, adoptedGroup.groupId);
        }
        if (changes.businessOwnerEmployeeId !== undefined) {
          await this.applications.closeOpenOwnerPeriod(tx, id);
          await this.applications.openOwnerPeriod(tx, {
            applicationId: id,
            employeeId: changes.businessOwnerEmployeeId,
            assignedByAppUserId: actor.appUserId,
          });
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
      });

      return (await this.withOwners([record]))[0];
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /** The plan changes worth recommending to the owner today, read not decided: three people on K1 plans suggest K2. */
  private async recommendationsOf(applicationId: string): Promise<K2Recommendation[]> {
    const k1Plans = (await this.plans.plansOfApplication(applicationId))
      .filter((plan) => plan.provisioningType === 'K1')
      .map((plan) => plan.id);
    if (k1Plans.length === 0) return [];
    const today = await this.organization.businessToday();
    const recommendation = recommendK2(await this.occupancy.current().openHolderCount(k1Plans, today));

    return recommendation ? [recommendation] : [];
  }

  /** Locks the employee `FOR SHARE` so a departure cannot slip in, then requires them to be still working (`INV-06`). */
  private async requireWorkingOwner(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) throw new ApplicationBusinessOwnerInvalidError();
      throw error;
    }
    const employee = await this.organization.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new ApplicationBusinessOwnerInvalidError();
  }

  private async requireActiveGroup(tx: DbTx, id: string): Promise<{ id: string; name: string }> {
    const group = await this.functionalGroups.findActive(tx, id);
    if (!group) throw new ApplicationFunctionalGroupInvalidError();

    return group;
  }

  private mapWriteError(error: unknown): unknown {
    if (isUniqueViolation(error, 'dictionary_line_id')) return new ApplicationDictionaryLineTakenError();
    if (isUniqueViolation(error, 'normalized_name')) return new ApplicationNameTakenError();
    if (isCheckViolation(error)) return new ApplicationDictionaryLineMismatchError();

    return error;
  }

  private async withOwners(records: ApplicationRecord[]): Promise<ApplicationView[]> {
    const employees = await this.organization.getEmployees([
      ...new Set(records.map((record) => record.businessOwnerEmployeeId)),
    ]);
    const byId = new Map<string, BusinessOwnerView>(
      employees.map((employee) => [
        employee.id,
        {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          status: employee.status,
        },
      ]),
    );

    return records.map((record) => {
      const businessOwner = byId.get(record.businessOwnerEmployeeId);
      if (!businessOwner) throw new Error('The Business Owner of an application is not an employee');

      return { ...record, businessOwner, businessOwnerReplacementRequired: replacementRequired(businessOwner.status) };
    });
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The application catalog was used before installation');

    return organization.id;
  }
}
