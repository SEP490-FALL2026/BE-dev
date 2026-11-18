import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** Owns PasswordCredential: the hash of an account's password. The one writer of `password_credentials`. */
@Injectable()
export class CredentialRepo {
  async createCredential(tx: DbTx, appUserId: string, hash: string, hashPolicyVersion: number): Promise<void> {
    await tx.passwordCredential.create({ data: { appUserId, hash, hashPolicyVersion } });
  }

  /** Replaces an activated account's password hash. The credential row already exists (activation made it). */
  async replaceCredential(
    tx: DbTx,
    appUserId: string,
    hash: string,
    hashPolicyVersion: number,
    now: Date,
  ): Promise<void> {
    await tx.passwordCredential.update({ where: { appUserId }, data: { hash, hashPolicyVersion, changedAt: now } });
  }
}
