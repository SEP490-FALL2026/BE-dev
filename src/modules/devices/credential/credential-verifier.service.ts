import { Injectable } from '@nestjs/common';
import { toTransientError } from '../../../infrastructure/database/transaction-runner';
import { TokenVerificationUnavailableError } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type {
  DeviceCredentialVerdict,
  DeviceCredentialVerifierPort,
} from '../../../infrastructure/security/tokens/device-credential-verifier.port';
import { parseDeviceToken } from '../../../infrastructure/security/tokens/device-token';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { judgeCredential, matchSecret } from './credential.policy';
import { CredentialRepo } from './credential.repo';

/**
 * Checks a device credential against the database on every request (`US-09-05` AC-13): the id and the secret, then whether it was
 * revoked, its registration ended, its machine retired, its holder left or blocked, or it expired. It never tries a user token. A database
 * that cannot answer is `TokenVerificationUnavailableError` (a 503), never a bad credential.
 */
@Injectable()
export class CredentialVerifier implements DeviceCredentialVerifierPort {
  constructor(
    private readonly repo: CredentialRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identityAccess: IdentityAccessApi,
  ) {}

  async verify(token: string, now: Date = new Date()): Promise<DeviceCredentialVerdict> {
    const parsed = parseDeviceToken(token);
    if (!parsed) return { status: 'INVALID' };

    try {
      const facts = await this.repo.findForVerification(parsed.credentialId);
      if (!facts) return { status: 'INVALID' };
      const holder = await this.organizationReads.getEmployee(facts.holderEmployeeId);
      // The holder is out when they left, or when a block of the last working day is in force (QĐ-100q); a person who is blocked has no
      // credential from that day, as they have no sign-in.
      const holderTerminated =
        holder?.status !== 'ACTIVE' || (await this.identityAccess.isAccessBlocked(facts.holderEmployeeId));
      const status = judgeCredential({ ...facts, holderTerminated }, parsed.secret, now);
      if (status !== 'OK') return { status };
      // The first use of the current secret ends the one before it: the tool has the new secret.
      if (facts.secretUsedAt === null && matchSecret(facts, parsed.secret, now) === 'CURRENT') {
        await this.repo.markSecretUsed(facts.id, facts.secretHash, now);
      }

      return { status: 'OK', credentialId: facts.id, collectorKind: facts.collectorKind };
    } catch (error) {
      // Could not reach the database: the credential may be fine, so this is a 503, never a 401.
      if (toTransientError(error)) throw new TokenVerificationUnavailableError(error);
      throw error;
    }
  }
}
