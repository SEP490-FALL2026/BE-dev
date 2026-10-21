import { Injectable } from '@nestjs/common';
import { CurrencyNotSupportedError } from '../../core/money/money.errors';
import { Prisma } from '../../generated/prisma/client';
import { readSqlState, TransactionRunner } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { OrganizationService } from '../organization/organization.service';
import { ReportingCurrencyLockedError } from './operating-parameters.errors';

/**
 * The reporting currency of the organization (`US-01-04` AC-9, `QĐ-42c`): the Super Admin may change it until a rate has
 * been entered or a subscription has a price converted into it, even a price in the reporting currency itself; from
 * then on it is locked and nothing is recomputed. The lock is the database's (a trigger on the organization), so it
 * holds for every writer; this service reads its answer.
 */
@Injectable()
export class ReportingCurrencyService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly finance: FinanceService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async get(): Promise<{ currency: string }> {
    return { currency: (await this.requireOrganization()).reportingCurrency };
  }

  /**
   * Sets the currency. Throws CurrencyNotSupportedError for a code finance does not know and
   * ReportingCurrencyLockedError once it is locked. The same currency again records nothing and says `changed: false`.
   */
  async set(actor: AuthenticatedPrincipal, currency: string): Promise<{ currency: string; changed: boolean }> {
    if (!(await this.finance.findCurrency(currency))) throw new CurrencyNotSupportedError(currency);
    const organization = await this.requireOrganization();
    if (organization.reportingCurrency === currency) return { currency, changed: false };

    try {
      await this.runner.run(async (tx) => {
        await this.organization.setReportingCurrency(tx, organization.id, currency);
        await this.audit.record(tx, {
          organizationId: organization.id,
          actorKind: 'USER',
          actorAppUserId: actor.appUserId,
          actorRoles: actor.roles,
          action: 'ORGANIZATION.REPORTING_CURRENCY_CHANGED',
          resourceType: 'Organization',
          resourceId: organization.id,
          before: { currency: organization.reportingCurrency },
          after: { currency },
          correlationId: actor.sessionId,
        });
      });
    } catch (error) {
      throw lockOf(error) ?? error;
    }

    return { currency, changed: true };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The reporting currency was read before installation');

    return organization;
  }
}

/** The lock the database raised (SQLSTATE 55000), told apart by what its message says, or null for any other failure. */
function lockOf(error: unknown): ReportingCurrencyLockedError | null {
  if (readSqlState(error) !== '55000') return null;
  const haystack = JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {});
  if (haystack.includes('exchange rates')) return new ReportingCurrencyLockedError('EXCHANGE_RATE');
  if (haystack.includes('converted prices')) return new ReportingCurrencyLockedError('CONVERTED_PRICE');

  return null;
}
