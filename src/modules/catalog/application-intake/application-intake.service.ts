import { Injectable } from '@nestjs/common';
import { searchKey } from '../../../core/search-key';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import { ApplicationDuplicateError } from '../catalog-entry/application.errors';
import { cleanApplicationDomains, cleanApplicationName, vendorSourceOf } from '../catalog-entry/application.policy';
import { ApplicationService } from '../catalog-entry/application.service';
import type { ApplicationView, DataSensitivity } from '../catalog-entry/application.types';
import { PlanService, type DeclarePlanInput } from '../plan/plan.service';
import type { PlanRecord } from '../plan/plan.types';
import { duplicateOf } from '../public/catalog-duplicate.policy';
import { applicationKindOf } from './application-intake.policy';

export interface CreateApplicationInput {
  name: string;
  vendorName?: string;
  dictionaryServiceLineId?: string;
  homepageUrl?: string;
  domains?: string[];
  functionalGroupId?: string;
  dataSensitivity?: DataSensitivity | null;
  plan: Omit<DeclarePlanInput, 'applicationId' | 'pricingModel'>;
}

/**
 * A new entry of the catalog in one command (`QĐ-111f`): the application and its first plan are written in one transaction, so a plan the rules
 * refuse leaves no application behind. The kind of the application follows the kind of provisioning of the plan (`QĐ-111d`), the pricing model of
 * the plan is worked out by the plan (`B-5`), the IT Admin who makes it answers for it (`QĐ-111g`), and software the catalog already has, by name or
 * by domain, is refused with the entry it is (`QĐ-111b`).
 */
@Injectable()
export class ApplicationIntakeService {
  constructor(
    private readonly applications: ApplicationService,
    private readonly facts: ApplicationFactsService,
    private readonly plans: PlanService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws ApplicationDuplicateError (with the entry that has the name or the domain), the vendor, name and domain errors of the application, the
   * errors of the plan, and the errors the database gives to a name or a dictionary line already taken. `proposed` is true when the software is
   * outside the dictionary.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: CreateApplicationInput,
  ): Promise<{ application: ApplicationView; plan: PlanRecord; proposed: boolean }> {
    const kind = applicationKindOf(input.plan.provisioningType);
    const source = vendorSourceOf({
      kind,
      ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
      ...(input.dictionaryServiceLineId !== undefined
        ? { dictionaryServiceLineId: input.dictionaryServiceLineId }
        : {}),
    });
    const name = cleanApplicationName(input.name);
    const domains = cleanApplicationDomains([
      ...(input.homepageUrl ? [input.homepageUrl] : []),
      ...(input.domains ?? []),
    ]);

    const made = await this.runner.run(async (tx) => {
      const candidates = await this.facts.duplicateCandidates(tx, searchKey(name), domains);
      const duplicate = duplicateOf({ name, domains }, candidates);
      if (duplicate) {
        const entry = candidates.find((candidate) => candidate.id === duplicate.entry.id);
        throw new ApplicationDuplicateError(
          {
            id: duplicate.entry.id,
            name: duplicate.entry.name,
            vendorName: entry?.vendorName ?? null,
            functionalGroup: entry?.functionalGroup ?? null,
          },
          duplicate.by,
        );
      }

      const record = await this.applications.declareRecord(
        actor,
        {
          name,
          kind,
          ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
          ...(input.dictionaryServiceLineId !== undefined
            ? { dictionaryServiceLineId: input.dictionaryServiceLineId }
            : {}),
          domains,
          ...(input.functionalGroupId !== undefined ? { functionalGroupId: input.functionalGroupId } : {}),
          dataSensitivity: input.dataSensitivity ?? null,
        },
        tx,
      );
      const plan = await this.plans.declare(actor, { ...input.plan, applicationId: record.id }, tx);

      return { record, plan };
    });

    return {
      application: await this.applications.viewOf(made.record),
      plan: made.plan,
      proposed: source.type === 'NAME',
    };
  }
}
