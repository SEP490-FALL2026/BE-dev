import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Page, pageOf } from '../../../core/application/pagination';
import { CurrencyNotSupportedError } from '../../../core/money/money.errors';
import { formatRate, parseRate } from '../../../core/money/rate';
import { readSqlState, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { CurrencyService } from '../currency/currency.service';
import type { ExchangeRateRecord } from '../public/finance.types';
import { financeAuditEvent } from '../finance-audit-event.mapper';
import {
  ExchangeRateAlreadyRecordedError,
  ExchangeRateDateInFutureError,
  ExchangeRateDateTooOldError,
  ExchangeRateSameAsReportingCurrencyError,
} from './exchange-rate.errors';
import { rateDateProblem } from './exchange-rate.policy';
import { ExchangeRateLedgerService } from './exchange-rate-ledger.service';

export interface ExchangeRateView extends ExchangeRateRecord {
  reportingCurrency: string;
}

/**
 * The manually entered exchange rates (`US-04-05` AC-4). A rate is entered once per currency and day and never
 * changed; the audit event commits with the row.
 */
@Injectable()
export class ExchangeRateService {
  constructor(
    private readonly currencies: CurrencyService,
    private readonly ledger: ExchangeRateLedgerService,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    currency?: string;
    from?: BusinessDate;
    to?: BusinessDate;
    page: number;
    pageSize: number;
  }): Promise<Page<ExchangeRateView>> {
    const organization = await this.requireOrganization();
    const { items, total } = await this.ledger.list(organization.id, {
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(
      items.map((item) => ({ ...item, reportingCurrency: organization.reportingCurrency })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Records a rate. Throws the rate errors of `core/money` for a malformed, over-precise or out-of-range rate,
   * CurrencyNotSupportedError, ExchangeRateSameAsReportingCurrencyError, ExchangeRateDateInFutureError,
   * ExchangeRateDateTooOldError, and ExchangeRateAlreadyRecordedError when the currency already has a rate that day.
   */
  async record(
    actor: AuthenticatedPrincipal,
    input: { currency: string; rateDate: BusinessDate; rate: string },
  ): Promise<ExchangeRateView> {
    const rate = parseRate(input.rate);
    if (!(await this.currencies.find(input.currency))) throw new CurrencyNotSupportedError(input.currency);
    const problem = rateDateProblem(input.rateDate, await this.organization.businessToday());
    if (problem === 'DATE_IN_FUTURE') throw new ExchangeRateDateInFutureError();
    if (problem === 'DATE_TOO_OLD') throw new ExchangeRateDateTooOldError();

    try {
      return await this.runner.run(async (tx) => {
        // The reporting currency that governs the rate, read with the organization row held FOR SHARE until the rate
        // commits (DB-01): a change in flight is waited for and then read, and a change after this one waits
        // for the rate and is refused by the lock. The check, the audit and the answer all speak this currency.
        const organization = await this.organization.getOrganizationShared(tx);
        if (!organization) throw new Error('Exchange rates were used before installation');
        if (input.currency === organization.reportingCurrency) {
          throw new ExchangeRateSameAsReportingCurrencyError(input.currency);
        }
        const row = await this.ledger.insert(tx, {
          organizationId: organization.id,
          currency: input.currency,
          rateDate: input.rateDate,
          rate,
        });
        await this.audit.record(
          tx,
          financeAuditEvent(actor, organization.id, 'EXCHANGE_RATE.RECORDED', 'ExchangeRate', row.id, null, {
            currency: row.currency,
            rateDate: row.rateDate,
            rate: formatRate(row.rate),
            reportingCurrency: organization.reportingCurrency,
            source: 'MANUAL',
          }),
        );

        return { ...row, reportingCurrency: organization.reportingCurrency };
      });
    } catch (error) {
      // The unique (organization, currency, day) decided between two simultaneous entries.
      if (readSqlState(error) === '23505') throw new ExchangeRateAlreadyRecordedError();
      // The database trigger refused a rate for the reporting currency (changed since the check above).
      if (readSqlState(error) === '23514') throw new ExchangeRateSameAsReportingCurrencyError(input.currency);
      throw error;
    }
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('Exchange rates were used before installation');

    return organization;
  }
}
