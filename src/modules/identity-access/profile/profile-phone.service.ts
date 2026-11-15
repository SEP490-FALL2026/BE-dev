import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { AccountNotFoundError } from '../accounts/account.errors';
import { WorkPhoneInvalidError } from './profile.errors';
import { normalizeWorkPhone } from './profile.policy';
import { ProfileRepo } from './profile.repo';

/** The person changes their own work phone (`QĐ-111at`, R-22). The audit trail says that it changed or was cleared, never the number. */
@Injectable()
export class ProfilePhoneService {
  constructor(
    private readonly repo: ProfileRepo,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws WorkPhoneInvalidError and AccountNotFoundError. */
  async change(actor: AuthenticatedPrincipal, raw: string | null): Promise<{ workPhone: string | null }> {
    const phone = normalizeWorkPhone(raw);
    if (!phone.ok) throw new WorkPhoneInvalidError();

    return this.runner.run(async (tx) => {
      const locked = await this.repo.lockProfile(tx, actor.appUserId);
      if (!locked) throw new AccountNotFoundError();
      await this.repo.setWorkPhone(tx, actor.appUserId, phone.value);
      await this.audit.record(tx, {
        organizationId: locked.organizationId,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'PROFILE.WORK_PHONE_CHANGED',
        resourceType: 'AppUser',
        resourceId: actor.appUserId,
        before: { hadWorkPhone: locked.workPhone !== null },
        after: { hasWorkPhone: phone.value !== null },
        correlationId: actor.sessionId,
      });

      return { workPhone: phone.value };
    });
  }
}
