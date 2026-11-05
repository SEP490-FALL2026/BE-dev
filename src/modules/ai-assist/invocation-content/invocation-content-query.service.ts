import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { contentReadEvent } from '../invocation/invocation-audit-event.mapper';
import { AiInvocationContentRepo } from '../invocation/invocation-content.repo';
import type { InvocationContentRecord } from '../invocation/invocation.types';
import { InvocationContentNotFoundError } from './invocation-content.errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The content of a call as the Super Admin reads it: what was sent, what came back and what the checks kept. */
export type InvocationContentView = Omit<InvocationContentRecord, 'organizationId'>;

/**
 * The content of one call of the AI for the Super Admin (`OQ-G-06`): the only way to read what was said to the model and what it
 * answered. Who may call is decided by the route (`SUPER_ADMIN`); every read writes `AI_INVOCATION.CONTENT_READ` in the transaction of
 * the read, so a content is never given without its event, and the event names the call only.
 */
@Injectable()
export class InvocationContentQueryService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly contents: AiInvocationContentRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Throws InvocationContentNotFoundError for an id that has no content (never made, or purged); nothing is recorded then. */
  async read(actor: AuthenticatedPrincipal, invocationId: string): Promise<InvocationContentView> {
    if (!UUID.test(invocationId)) throw new InvocationContentNotFoundError();

    return this.runner.run(async (tx) => {
      const found = await this.contents.find(tx, invocationId);
      if (found === null) throw new InvocationContentNotFoundError();
      const { organizationId, ...content } = found;
      await this.audit.record(
        tx,
        contentReadEvent(
          { appUserId: actor.appUserId, roles: actor.roles, sessionId: actor.sessionId },
          organizationId,
          invocationId,
        ),
      );

      return content;
    });
  }
}
