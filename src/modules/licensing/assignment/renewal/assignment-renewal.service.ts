import { Injectable } from '@nestjs/common';
import { normalizeAccountIdentifier } from '../../public/account-identifier.policy';
import { addDays, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AssignmentNotFoundError, AssignmentRenewalRefusedError } from '../../public/licensing.errors';
import type { AssignmentFacts, RenewAssignmentInput, RenewedAssignment } from '../../public/licensing-renewal.types';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { toAssignmentFailure } from '../assignment-conflicts.repo';
import { AssignmentEndService } from '../assignment-end.service';
import { AssignmentFactsRepo } from './assignment-facts.repo';
import { AssignmentRepo } from '../assignment.repo';

const later = (a: BusinessDate, b: BusinessDate): BusinessDate => (a > b ? a : b);

/**
 * The renewal of a right that ends on a day (`US-05-14` AC-1, AC-2): the old record is not edited. It ends where the right was
 * expected to end (or today when the decision comes later), and a new record of the same seat begins that day, chained to it,
 * expecting the new end. The seats taken on any day do not change, because the two periods meet and do not overlap. It also
 * answers what a return and a renewal need to know of a seat. Always in the caller transaction, under the lock of the
 * subscription and then of the assignment, with the audit events of both records.
 */
@Injectable()
export class AssignmentRenewalService {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly facts: AssignmentFactsRepo,
    private readonly ending: AssignmentEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** The facts of a seat, optionally under its lock (the subscription first, then the assignment). Throws AssignmentNotFoundError. */
  async read(tx: DbTx, assignmentId: string, lock: boolean): Promise<AssignmentFacts> {
    if (lock) await this.ending.lock(tx, assignmentId);
    const found = await this.facts.find(assignmentId, tx);
    if (!found) throw new AssignmentNotFoundError();

    return found;
  }

  /**
   * Ends the old record and begins the new one. Throws AssignmentNotFoundError, AssignmentRenewalRefusedError and
   * AssignmentConflictError (the database refused the new record: the data changed since it was asked).
   */
  async renew(tx: DbTx, actor: AuthenticatedPrincipal, input: RenewAssignmentInput): Promise<RenewedAssignment> {
    const current = await this.ending.lock(tx, input.assignmentId);
    const facts = await this.read(tx, input.assignmentId, false);
    if (current.kind === 'SERVICE') throw new AssignmentRenewalRefusedError('SERVICE_ACCOUNT');
    if (!facts.open) throw new AssignmentRenewalRefusedError('NOT_OPEN');
    if (current.expectedEndDate !== input.previousExpectedEndDate)
      throw new AssignmentRenewalRefusedError('END_CHANGED');
    if (facts.revocationLive) throw new AssignmentRenewalRefusedError('REVOCATION_PENDING');

    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A seat was renewed before installation');
    const today = await this.organizationReads.businessToday(input.now, tx);
    // The period of a record is never empty: a seat that began today and was to end today still runs a day.
    const endsOn = later(later(input.previousExpectedEndDate, today), addDays(current.effectiveFrom, 1));

    await this.repo.end(tx, current.id, endsOn);
    let successor;
    try {
      successor = await this.repo.insert(tx, {
        organizationId: organization.id,
        source: 'REQUEST',
        kind: current.kind,
        planId: current.planId,
        subscriptionId: current.subscriptionId,
        employeeId: current.employeeId,
        accountIdentifier: current.accountIdentifier,
        normalizedAccountIdentifier: normalizeAccountIdentifier(current.accountIdentifier),
        reason: current.reason,
        costCenterId: current.costCenterId,
        owningDepartmentId: current.owningDepartmentId,
        effectiveFrom: endsOn,
        effectiveFromBasis: 'ACTUAL',
        expectedEndDate: input.newExpectedEndDate,
        predecessorId: current.id,
        baselineImportId: null,
        // The record that follows a flagged seat is the same machine account: its flag and its reason go on (`R-9`).
        isMachineAccount: current.isMachineAccount,
        machineAccountNote: current.machineAccountNote,
        createdByAppUserId: actor.appUserId,
      });
    } catch (error) {
      throw toAssignmentFailure(error, 0) ?? error;
    }

    // Neither the identifier of the account nor its reason enters the audit trail.
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'LICENSE_ASSIGNMENT.ENDED',
        'LicenseAssignment',
        current.id,
        { validUntil: null },
        { validUntil: endsOn, reason: 'RENEWED', successorId: successor.id, requestId: input.requestId },
      ),
    );
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'LICENSE_ASSIGNMENT.CREATED',
        'LicenseAssignment',
        successor.id,
        null,
        {
          source: 'REQUEST',
          kind: successor.kind,
          planId: successor.planId,
          subscriptionId: successor.subscriptionId,
          employeeId: successor.employeeId,
          effectiveFrom: successor.effectiveFrom,
          effectiveFromBasis: successor.effectiveFromBasis,
          expectedEndDate: successor.expectedEndDate,
          predecessorId: current.id,
          requestId: input.requestId,
        },
      ),
    );

    return { previousAssignmentId: current.id, successorAssignmentId: successor.id, endsOn };
  }
}
