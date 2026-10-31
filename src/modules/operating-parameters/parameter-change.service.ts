import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../audit/public/audit.api';
import { OrganizationReadApi } from '../organization/public/organization-read.api';
import {
  ParameterLockedError,
  ParameterNotFoundError,
  ParameterValueInvalidError,
} from './operating-parameters.errors';
import { OperatingParametersRepo } from './operating-parameters.repo';
import {
  definitionOf,
  effectiveValues,
  validateParameterValue,
  type ParameterValue,
} from './parameter-definitions.policy';
import { ParameterLockContributions } from './public/operating-parameters.extension-points';
import { OperatingParametersApi, type ParameterView } from './public/operating-parameters.api';

/**
 * The change of an operating parameter by the Super Admin (`US-01-04`), served by the API only. It is the one place that asks the
 * modules above whether a value is locked (`ParameterLockContributions`), so a graph with no route to change a parameter needs none of
 * them.
 */
@Injectable()
export class ParameterChangeService {
  constructor(
    private readonly repo: OperatingParametersRepo,
    private readonly parameters: OperatingParametersApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly locks: ParameterLockContributions,
  ) {}

  /**
   * Sets a parameter from now on (AC-12, AC-13). A value outside the domain, or one that would put two parameters out of order, is
   * refused and changes nothing (AC-3). The same value as now records nothing. A value that something made under it holds in place
   * (the month the fiscal year begins, once a budget version exists) is refused with ParameterLockedError and changes nothing, no
   * audit record included (AC-8). Throws ParameterNotFoundError for an unknown key and ParameterValueInvalidError.
   */
  async set(actor: AuthenticatedPrincipal, key: string, value: unknown): Promise<ParameterView> {
    if (!definitionOf(key)) throw new ParameterNotFoundError(key);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The operating parameters were used before installation');

    await this.runner.run(async (tx) => {
      await this.repo.lockKey(tx, key);
      const current = effectiveValues(await this.repo.currentRows(tx));
      const verdict = validateParameterValue(key, value, current);
      if (!verdict.ok) {
        throw verdict.reason === 'UNKNOWN_KEY'
          ? new ParameterNotFoundError(key)
          : new ParameterValueInvalidError(key, verdict.reason);
      }
      const next = value as ParameterValue;
      if (JSON.stringify(current[key]) === JSON.stringify(next)) return;
      await this.requireUnlocked(tx, key);

      await this.repo.replaceCurrent(tx, {
        organizationId: organization.id,
        key,
        value: next,
        changedBy: actor.appUserId,
        now: new Date(),
      });
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'PARAMETER.CHANGED',
        resourceType: 'OperatingParameter',
        resourceId: key,
        before: { value: current[key] },
        after: { value: next },
        correlationId: actor.sessionId,
      });
    });

    return (await this.parameters.list()).find((view) => view.key === key) as ParameterView;
  }

  private async requireUnlocked(tx: DbTx, key: string): Promise<void> {
    for (const reader of this.locks.all()) {
      if (reader.key !== key) continue;
      const reason = await reader.lockOf(tx);
      if (reason) throw new ParameterLockedError(key, reason);
    }
  }
}
