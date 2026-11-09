import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { UsageRunContext } from './usage-rules.types';

/** Every vendor report of an application is past a week old: the IT Admin is told once for each source and the day its coverage ended (`Q-91`). */
@Injectable()
export class UsageStaleNoticeService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async tell(
    run: UsageRunContext,
    applicationId: string,
    stale: ReadonlyArray<{
      sourceId: string | null;
      name: string;
      coverage: { to: string } | null;
      ageDays: number | null;
    }>,
  ): Promise<void> {
    const recipient = await this.identity.findFirstUsableItAdminEmployeeId();
    if (!recipient) return;
    for (const source of stale) {
      if (!source.coverage) continue;
      const coverageTo = source.coverage.to;
      await this.runner.run((tx) =>
        this.notifications.notifyInApp(tx, {
          organizationId: run.organizationId,
          recipientEmployeeId: recipient,
          code: 'USAGE_SOURCE_STALE',
          subject: { type: 'APPLICATION', id: applicationId },
          params: { applicationId, source: source.name, coverageTo, freshnessDays: source.ageDays ?? 0 },
          eventKey: `USAGE_SOURCE_STALE:${source.sourceId ?? 'collector'}:${coverageTo}`,
        }),
      );
    }
  }
}
