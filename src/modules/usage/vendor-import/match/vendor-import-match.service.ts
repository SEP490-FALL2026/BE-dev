import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { normalizeAccountIdentifier } from '../../../licensing/public/account-identifier.policy';
import { LicensingUsageApi } from '../../../licensing/public/licensing-usage.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { IdentityRepo } from '../../identity/identity.repo';
import type { UsageIdentifierType } from '../../vendor-source/vendor-source.types';
import type { RowOutcome } from '../vendor-import.types';
import {
  aliasVariants,
  judgeIdentity,
  looksLikeEmail,
  type IdentifierFacts,
  type IdentityJudgement,
} from './vendor-import-match.policy';

export interface MatchRowInput {
  identifierNormalized: string;
  notAPerson: boolean;
  invalid: boolean;
}

export interface RowJudgement extends Omit<IdentityJudgement, 'outcome'> {
  outcome: RowOutcome;
}

const NOT_JUDGED: RowJudgement = {
  outcome: 'INVALID',
  employeeId: null,
  method: null,
  confidence: null,
  candidates: [],
};

/**
 * Ties the identifiers of a report to people when it is read (`FR-4.5`, `FR-4.6`): the facts of each step are read for all the
 * identifiers in a fixed number of statements, then the pure rule judges each one. Nothing is written here; the mapping a new match makes is
 * written by the confirmation.
 */
@Injectable()
export class VendorImportMatchService {
  constructor(
    private readonly identities: IdentityRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensingUsage: LicensingUsageApi,
  ) {}

  async judge(
    context: { applicationId: string; identifierType: UsageIdentifierType },
    rows: readonly MatchRowInput[],
    tx?: DbTx,
  ): Promise<RowJudgement[]> {
    const judged = rows.filter((row) => !row.invalid && !row.notAPerson);
    const identifiers = [...new Set(judged.map((row) => row.identifierNormalized))];
    const mappings = await this.identities.mappingsInForce(
      context.applicationId,
      context.identifierType,
      identifiers,
      tx,
    );

    const ended = await this.identities.identifiersWithEndedMapping(
      context.applicationId,
      context.identifierType,
      identifiers.filter((id) => !mappings.has(id)),
      tx,
    );
    const emails = identifiers.filter((id) => !mappings.has(id) && looksLikeEmail(id));
    const emailHits = await this.emailHits(emails, tx);
    const accountKeys = new Map(
      identifiers.filter((id) => !mappings.has(id)).map((id) => [id, normalizeAccountIdentifier(id)]),
    );
    const holders = await this.licensingUsage.findHoldersByAccountIdentifiers(
      context.applicationId,
      [...new Set(accountKeys.values())],
      tx,
    );
    const holdersOf = new Map<string, string[]>();
    for (const holder of holders) {
      holdersOf.set(holder.normalizedAccountIdentifier, [
        ...(holdersOf.get(holder.normalizedAccountIdentifier) ?? []),
        holder.employeeId,
      ]);
    }

    // The rule of aliases is tried only for what the exact steps could not tell.
    const unresolved = emails.filter(
      (id) => (emailHits.get(id) ?? []).length === 0 && !holdersOf.has(accountKeys.get(id) ?? id),
    );
    const domains = unresolved.length > 0 ? await this.organizationReads.getCompanyEmailDomains(tx) : [];
    const variantsOf = new Map(unresolved.map((id) => [id, aliasVariants(id, domains)]));
    const variantHits = await this.emailHits([...new Set([...variantsOf.values()].flat())], tx);

    return rows.map((row) => {
      if (row.invalid) return NOT_JUDGED;
      if (row.notAPerson) return { ...NOT_JUDGED, outcome: 'NOT_A_PERSON' };
      const id = row.identifierNormalized;
      const mapping = mappings.get(id);
      const facts: IdentifierFacts = {
        mapping: mapping ? { employeeId: mapping.employeeId, method: mapping.method } : null,
        mappingEnded: !mapping && ended.has(id),
        emailHits: emailHits.get(id) ?? [],
        accountHits: holdersOf.get(accountKeys.get(id) ?? id) ?? [],
        aliasHits: (variantsOf.get(id) ?? []).flatMap((variant) => variantHits.get(variant) ?? []),
      };

      return judgeIdentity(facts);
    });
  }

  /** The people with each of these work emails (one at most for each, the email is unique), those who left included. */
  private async emailHits(normalizedEmails: readonly string[], tx?: DbTx): Promise<Map<string, string[]>> {
    const people = await this.organizationReads.getEmployeesByWorkEmails(normalizedEmails, tx);
    const hits = new Map<string, string[]>();
    for (const person of people)
      hits.set(person.normalizedWorkEmail, [...(hits.get(person.normalizedWorkEmail) ?? []), person.id]);

    return hits;
  }
}
