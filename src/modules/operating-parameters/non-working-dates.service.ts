import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../core/application/pagination';
import { BusinessDate } from '../../core/business-date';
import { TransactionRunner } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../audit/public/audit.api';
import { OrganizationApi } from '../organization/public/organization.api';
import {
  NonWorkingDateInPastError,
  NonWorkingDateNotFoundError,
  NonWorkingDateReasonInvalidError,
  NonWorkingDateTakenError,
} from './operating-parameters.errors';
import { NonWorkingDateRow, OperatingParametersRepo } from './operating-parameters.repo';

const REASON_MAX_LENGTH = 200;

/**
 * The days nobody works (`US-01-04` AC-10). A day from today on may be added, renamed or removed; a day already past
 * never changes again, because deadlines already counted over it must keep meaning what they meant.
 */
@Injectable()
export class NonWorkingDatesService {
  constructor(
    private readonly repo: OperatingParametersRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** One page of the days nobody works by date, optionally between two dates. */
  async list(query: {
    from?: BusinessDate;
    to?: BusinessDate;
    page: number;
    pageSize: number;
  }): Promise<Page<NonWorkingDateRow>> {
    const { items, total } = await this.repo.pageNonWorkingDates(
      query,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Whether `date` is a non-working date; for the working-day arithmetic of the workflows to come. */
  async isNonWorking(date: BusinessDate): Promise<boolean> {
    return (await this.repo.listNonWorkingDates({ from: date, to: date })).length > 0;
  }

  async add(actor: AuthenticatedPrincipal, input: { date: BusinessDate; reason: string }): Promise<NonWorkingDateRow> {
    const reason = this.requireReason(input.reason);
    await this.assertNotPast(input.date);
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const added = await this.repo.insertNonWorkingDate(tx, {
        organizationId: organization.id,
        date: input.date,
        reason,
        createdBy: actor.appUserId,
      });
      if (!added) throw new NonWorkingDateTakenError(input.date);
      await this.record(tx, actor, organization.id, 'NON_WORKING_DATE.ADDED', input.date, null, {
        date: input.date,
        reason,
      });
    });

    return { date: input.date, reason };
  }

  async rename(actor: AuthenticatedPrincipal, date: BusinessDate, rawReason: string): Promise<NonWorkingDateRow> {
    const reason = this.requireReason(rawReason);
    await this.assertNotPast(date);
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const current = await this.repo.lockNonWorkingDate(tx, date);
      if (!current) throw new NonWorkingDateNotFoundError(date);
      if (current.reason === reason) return;

      await this.repo.updateNonWorkingDateReason(tx, date, reason);
      await this.record(
        tx,
        actor,
        organization.id,
        'NON_WORKING_DATE.RENAMED',
        date,
        { reason: current.reason },
        { reason },
      );
    });

    return { date, reason };
  }

  async remove(actor: AuthenticatedPrincipal, date: BusinessDate): Promise<NonWorkingDateRow> {
    await this.assertNotPast(date);
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const current = await this.repo.lockNonWorkingDate(tx, date);
      if (!current) throw new NonWorkingDateNotFoundError(date);

      await this.repo.deleteNonWorkingDate(tx, date);
      await this.record(
        tx,
        actor,
        organization.id,
        'NON_WORKING_DATE.REMOVED',
        date,
        { date, reason: current.reason },
        null,
      );

      return current;
    });
  }

  private async assertNotPast(date: BusinessDate): Promise<void> {
    // Today itself may still change (AC-10 adds and removes 03/10 on 03/10); only a day before it may not.
    if (date < (await this.organization.businessToday())) throw new NonWorkingDateInPastError(date);
  }

  private requireReason(raw: string): string {
    const reason = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (reason === '' || [...reason].length > REASON_MAX_LENGTH) throw new NonWorkingDateReasonInvalidError();

    return reason;
  }

  private record(
    tx: Parameters<AuditApi['record']>[0],
    actor: AuthenticatedPrincipal,
    organizationId: string,
    action: string,
    date: BusinessDate,
    before: { [key: string]: string } | null,
    after: { [key: string]: string } | null,
  ): Promise<void> {
    return this.audit.record(tx, {
      organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      action,
      resourceType: 'NonWorkingDate',
      resourceId: date,
      before,
      after,
      correlationId: actor.sessionId,
    });
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The non-working dates were used before installation');

    return organization;
  }
}
