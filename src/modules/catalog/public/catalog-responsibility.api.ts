import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ResponsibilityHandoverService } from '../application-responsibility/responsibility-handover.service';
import { VendorAdminMinimumService } from '../plan/vendor-admin-minimum.service';
import { VendorAdminRolesService } from '../plan/vendor-admin-roles.service';
import type {
  ResponsibilitiesTransferred,
  ResponsibilityCounts,
  VendorAdminRole,
} from './catalog-responsibility.types';

/**
 * What an IT Admin answers for in the catalog as the hand-over of an IT Admin who leaves reads and moves it (`QĐ-111g`, `R-8`, `R-26`):
 * the subscriptions and the applications that name them responsible. The caller decides who may hand over and when; the catalog moves
 * them all in the caller's transaction.
 */
@Injectable()
export class CatalogResponsibilityApi {
  constructor(
    private readonly handover: ResponsibilityHandoverService,
    private readonly roles: VendorAdminRolesService,
    private readonly minimum: VendorAdminMinimumService,
  ) {}

  /** How many subscriptions and applications each of these employees answers for; an employee with none is counted zero. */
  countResponsibilitiesOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, ResponsibilityCounts>> {
    return this.handover.countOf(employeeIds, tx);
  }

  /**
   * The plans this person administers at the vendor (owner or admin of the workspace profile of a plan that needs admins) and, for each, how many of
   * the other admins recorded still work as IT Admins now: what a departure or a transfer of the person puts at risk (`QĐ-110k`).
   */
  vendorAdminRolesOf(employeeId: string, tx?: DbTx): Promise<VendorAdminRole[]> {
    return this.roles.of(employeeId, tx);
  }

  /**
   * How many plans in use that need admins at the vendor have fewer than two recorded who still work as IT Admins now: the number the overviews show
   * beside the flag `vendorAdminsBelowMinimum` of the subscriptions (SPEC P21).
   */
  countPlansBelowVendorAdminMinimum(tx?: DbTx): Promise<number> {
    return this.minimum.countPlansBelowMinimum(tx);
  }

  /**
   * Hands every subscription and every application `fromEmployeeId` answers for to `toEmployeeId`, in the caller's transaction, with an
   * audit event for each, written as `actor`; `source` names the departure or the transfer that asked for it, and the events say so. Throws
   * ResponsibilityHandoverRefusedError (the same person, or not an IT Admin who works now) with nothing written.
   */
  transferResponsibilities(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    fromEmployeeId: string,
    toEmployeeId: string,
    source?: { kind: string; id: string },
  ): Promise<ResponsibilitiesTransferred> {
    return this.handover.transfer(tx, actor, fromEmployeeId, toEmployeeId, source);
  }
}
