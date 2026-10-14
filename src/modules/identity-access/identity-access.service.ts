import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../../core/email';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { PasswordPolicyError } from './errors/identity-access.errors';
import { BootstrapSuperAdminInput } from './identity-access.types';
import { IdentityAccessRepo } from './identity-access.repo';
import { PASSWORD_HASH_POLICY_VERSION, PasswordHasher } from './password-hasher.service';
import { checkPasswordPolicy } from './password.policy';

/** Public facade of the identity-access module. */
@Injectable()
export class IdentityAccessService {
  constructor(
    private readonly repo: IdentityAccessRepo,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Checks the password policy and hashes the password. Call this BEFORE opening a transaction:
   * hashing is the slow part and must not hold database locks (lock protocol rule 3).
   */
  async prepareCredential(password: string, loginEmail: string): Promise<{ hash: string; hashPolicyVersion: number }> {
    const violation = checkPasswordPolicy(password, loginEmail);
    if (violation) throw new PasswordPolicyError(violation);

    return { hash: await this.hasher.hash(password), hashPolicyVersion: PASSWORD_HASH_POLICY_VERSION };
  }

  /**
   * Installation only (FR-9.8): an activated account for `employeeId` holding the one SUPER_ADMIN
   * grant. The email counts as asserted by the person running the command, not as verified by
   * an invitation, and is recorded that way.
   */
  async createBootstrapSuperAdmin(tx: DbTx, input: BootstrapSuperAdminInput): Promise<{ appUserId: string }> {
    const user = await this.repo.createAppUser(tx, {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      loginEmail: input.loginEmail.trim(),
      normalizedLoginEmail: normalizeEmail(input.loginEmail),
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      emailVerifiedAt: new Date(),
    });
    await this.repo.createCredential(tx, user.id, input.passwordHash, input.hashPolicyVersion);
    await this.repo.grantRole(tx, { organizationId: input.organizationId, appUserId: user.id, role: 'SUPER_ADMIN' });

    return { appUserId: user.id };
  }
}
