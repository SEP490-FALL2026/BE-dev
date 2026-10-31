import { Inject, Injectable } from '@nestjs/common';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { SeedPlan } from '../public/dev-seed.types';
import { DEMO_PEOPLE } from './dev-seed-fixture.types';
import type { PasswordGenerator } from './local-password.service';

export const LOCAL_PASSWORD_GENERATOR = Symbol('LOCAL_PASSWORD_GENERATOR');

/** The new password of each demo account to create, with its hash: the password is shown once, the hash is what is written. */
export type Credentials = Map<string, { password: string; hash: string; hashPolicyVersion: number }>;

/** Makes and hashes the passwords of the accounts a seed run will create, before any lock is taken (lock protocol rule 3). */
@Injectable()
export class DevSeedCredentialsService {
  constructor(
    private readonly identity: IdentityAccessApi,
    @Inject(LOCAL_PASSWORD_GENERATOR) private readonly generatePassword: PasswordGenerator,
  ) {}

  /** A new password for each account the plan creates, hashed outside any transaction. */
  async prepare(plan: SeedPlan): Promise<Credentials> {
    const credentials: Credentials = new Map();
    for (const person of DEMO_PEOPLE) {
      const account = plan.items.find((item) => item.kind === 'ACCOUNT' && item.key === person.employeeCode);
      if (account?.action !== 'create') continue;
      const password = this.generatePassword();
      const { hash, hashPolicyVersion } = await this.identity.prepareCredential(password, person.workEmail);
      credentials.set(person.employeeCode, { password, hash, hashPolicyVersion });
    }

    return credentials;
  }
}
