import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { MonitoringNoticeNotPublishedError, MonitoringNoticeReacknowledgementRequiredError } from './notice.errors';
import { addsToolStatusWithoutReacknowledgement } from './notice.policy';
import { NoticeRepo, type NoticeRecord } from './notice.repo';

export interface NoticeInput {
  collected: string;
  notCollected: string;
  purpose: string;
  retention: string;
  stopRight: string;
  includesToolStatus: boolean;
  requiresReacknowledgement: boolean;
}

/** The notice about what is collected (`US-09-03`): the Super Admin publishes a new version, everybody reads the one in force. */
@Injectable()
export class NoticeService {
  constructor(
    private readonly repo: NoticeRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws MonitoringNoticeNotPublishedError. */
  async current(): Promise<NoticeRecord> {
    const organization = await this.requireOrganization();
    const current = await this.repo.current(organization.id);
    if (!current) throw new MonitoringNoticeNotPublishedError();

    return current;
  }

  /**
   * Publishes the next version under the lock of the numbering; when it asks for a new acknowledgement every open registration
   * waits for one again, in the same transaction. Throws MonitoringNoticeReacknowledgementRequiredError.
   */
  async publish(actor: AuthenticatedPrincipal, input: NoticeInput): Promise<NoticeRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      await this.repo.lockNumbering(tx, organization.id);
      const current = await this.repo.current(organization.id, tx);
      if (addsToolStatusWithoutReacknowledgement(current, input)) {
        throw new MonitoringNoticeReacknowledgementRequiredError();
      }
      const notice = await this.repo.insert(tx, {
        ...input,
        organizationId: organization.id,
        publishedByAppUserId: actor.appUserId,
      });
      const reset = input.requiresReacknowledgement ? await this.repo.clearAcknowledgements(tx, organization.id) : 0;
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'MONITORING_NOTICE.PUBLISHED',
          'MonitoringNoticeVersion',
          notice.id,
          null,
          {
            versionNumber: notice.versionNumber,
            includesToolStatus: notice.includesToolStatus,
            requiresReacknowledgement: notice.requiresReacknowledgement,
            registrationsAskedAgain: reset,
          },
        ),
      );

      return notice;
    });
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The monitoring notice was used before installation');

    return organization;
  }
}
