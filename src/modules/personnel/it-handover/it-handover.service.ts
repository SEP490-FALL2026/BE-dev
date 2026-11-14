import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { ResponsibilityHandoverRefusedError } from '../../catalog/public/catalog-responsibility.errors';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { technicalStepRefusal } from '../personnel-self-action.policy';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { ItHandoverRefusedError } from './it-handover.errors';
import { handoverRefusal, milestoneDay, milestoneReached } from './it-handover.policy';
import { ItHandoverRepo } from './it-handover.repo';
import { ItHandoverSourceRepo } from './it-handover-source.repo';
import { ItHandoverTellingService } from './it-handover-telling.service';
import type { HandoverSource } from './it-handover.types';

/** What a hand-over moved, for the answer. */
export interface ItHandoverResult {
  source: HandoverSource;
  fromEmployeeId: string;
  toEmployeeId: string;
  subscriptions: number;
  applications: number;
  at: Date;
}

/**
 * An IT Admin who leaves hands every subscription and application they answer for to another IT Admin in one operation (`QĐ-110j`,
 * `QĐ-111g`, `R-8`, `R-26`, SPEC P5), for a departure or a transfer alike: the person who leaves does it before the block or the day the transfer
 * takes effect, any IT Admin from then on. It is never a condition of anything: the file is written, moves and closes without it. One
 * transaction, under the lock of the employee and then of the file: the catalog moves everything (an audit event for each thing), the item of
 * the file says it was done, the log of a departure and the Audit Trail say who handed what to whom, and the one who took it is told.
 */
@Injectable()
export class ItHandoverService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly items: ItHandoverRepo,
    private readonly sources: ItHandoverSourceRepo,
    private readonly catalog: CatalogResponsibilityApi,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly telling: ItHandoverTellingService,
  ) {}

  /** Throws PersonnelAccessRefusedError for a caller who is not an IT Admin, and ItHandoverRefusedError for everything else (nothing was written). */
  async handOver(
    actor: AuthenticatedPrincipal,
    source: HandoverSource,
    toEmployeeId: string,
  ): Promise<ItHandoverResult> {
    const forbidden = technicalStepRefusal(actor);
    if (forbidden) throw new PersonnelAccessRefusedError(forbidden);

    return this.runner.run(async (tx) => {
      const employeeId = await this.sources.employeeOf(source, tx);
      if (employeeId === null) throw new ItHandoverRefusedError('NOT_FOUND');
      // The lock protocol of the commands on a person: the employee first, then the file, read again under the lock.
      await this.organization.lockEmployeeForUpdate(tx, employeeId);
      const facts = await this.sources.lockSource(tx, source);
      if (!facts) throw new ItHandoverRefusedError('NOT_FOUND');
      const today = await this.organizationReads.businessToday(new Date(), tx);
      const block = source.kind === 'OFFBOARDING_CASE' ? await this.identity.findDepartureBlock(employeeId, tx) : null;
      const day = milestoneDay({
        kind: source.kind,
        blockedFrom: block && block.sourceCaseId === source.id ? block.blockedFrom : null,
        leftOn: facts.leftOn,
        effectiveOn: facts.effectiveOn,
      });
      const left = (await this.catalog.countResponsibilitiesOf([employeeId], tx)).get(employeeId);
      const refusal = handoverRefusal({
        cancelled: facts.cancelled,
        milestoneReached: milestoneReached(day, today),
        actorEmployeeId: actor.employeeId,
        leavingEmployeeId: employeeId,
        remaining: (left?.subscriptions ?? 0) + (left?.applications ?? 0),
      });
      if (refusal) throw new ItHandoverRefusedError(refusal);

      const moved = await this.move(tx, actor, source, employeeId, toEmployeeId);
      // What was counted a moment ago can have been moved by a write of its own since: nothing moved is nothing to record (the item keeps no empty hand-over).
      if (moved.subscriptions + moved.applications === 0) throw new ItHandoverRefusedError('NOTHING_TO_HAND_OVER');
      const at = new Date();
      await this.items.recordDone(tx, {
        organizationId: facts.organizationId,
        source,
        done: { at, toEmployeeId, subscriptions: moved.subscriptions, applications: moved.applications },
      });
      await this.telling.tell(tx, actor, facts.organizationId, source, { employeeId, toEmployeeId, ...moved });

      return { source, fromEmployeeId: employeeId, toEmployeeId, ...moved, at };
    });
  }

  /** The catalog moves everything; the two refusals of the person who would take it are the refusals of this hand-over. */
  private async move(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    source: HandoverSource,
    fromEmployeeId: string,
    toEmployeeId: string,
  ): Promise<{ subscriptions: number; applications: number }> {
    try {
      const moved = await this.catalog.transferResponsibilities(tx, actor, fromEmployeeId, toEmployeeId, source);

      return { subscriptions: moved.subscriptionIds.length, applications: moved.applicationIds.length };
    } catch (error) {
      if (error instanceof ResponsibilityHandoverRefusedError)
        throw new ItHandoverRefusedError(error.problem === 'SAME_EMPLOYEE' ? 'SAME_PERSON' : 'TARGET_NOT_IT_ADMIN');
      throw error;
    }
  }
}
