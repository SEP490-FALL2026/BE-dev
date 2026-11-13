import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ResponsibilityHandoverService } from '../application-responsibility/responsibility-handover.service';
import type { ResponsibilitiesTransferred, ResponsibilityCounts } from './catalog-responsibility.types';

/**
 * What an IT Admin answers for in the catalog as the hand-over of an IT Admin who leaves reads and moves it (`QĐ-111g`, `R-8`, `R-26`):
 * the subscriptions and the applications that name them responsible. The caller decides who may hand over and when; the catalog moves
 * them all in the caller's transaction.
 */
@Injectable()
export class CatalogResponsibilityApi {
  constructor(private readonly handover: ResponsibilityHandoverService) {}

  /** How many subscriptions and applications each of these employees answers for; an employee with none is counted zero. */
  countResponsibilitiesOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, ResponsibilityCounts>> {
    return this.handover.countOf(employeeIds, tx);
  }

  /**
   * Hands every subscription and every application `fromEmployeeId` answers for to `toEmployeeId`, in the caller's transaction, with an
   * audit event for each, written as `actor`. Throws ResponsibilityHandoverRefusedError (the same person, or not an IT Admin who works
   * now) with nothing written.
   */
  transferResponsibilities(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    fromEmployeeId: string,
    toEmployeeId: string,
  ): Promise<ResponsibilitiesTransferred> {
    return this.handover.transfer(tx, actor, fromEmployeeId, toEmployeeId);
  }
}
