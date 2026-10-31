import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AssignmentNotFoundError,
  AssignmentNotOpenError,
  RevocationRefusedError,
} from '../../licensing/public/licensing.errors';
import { LicensingRenewalApi } from '../../licensing/public/licensing-renewal.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { ReturnRequestRefusedError } from './return-request.errors';

/**
 * What the return of a seat asks of licensing (`US-05-13`): the seat as it is judged, whether a renewal waits for it, and the revocation
 * opened through the one gate of licensing. A refusal of the gate that is a fact about the seat is answered as the return it is.
 */
@Injectable()
export class ReturnSeatGate {
  constructor(
    private readonly licensingRenewals: LicensingRenewalApi,
    private readonly licensing: LicensingApi,
  ) {}

  async factsOf(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    try {
      return await this.licensingRenewals.getAssignmentFacts(tx, assignmentId);
    } catch (error) {
      if (error instanceof AssignmentNotFoundError) throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_FOUND');
      throw error;
    }
  }

  hasPendingRenewal(assignmentId: string, tx: DbTx): Promise<boolean> {
    return this.licensingRenewals.hasPendingRenewal(assignmentId, tx);
  }

  /**
   * Opens the revocation as the source it is. The person who sends the return is not the IT Admin who will work it, even when they
   * hold that role: the rule of an IT Admin who revokes their own seat is applied when the task is taken, so the role is not
   * handed to the gate here.
   */
  async openRevocation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; returnRequestId: string; head: boolean; reason: string; now: Date },
  ) {
    const asSender = { ...actor, roles: actor.roles.filter((role) => role !== 'IT_ADMIN') };
    try {
      return await this.licensing.openRevocation(tx, asSender, {
        assignmentId: input.assignmentId,
        source: input.head ? 'MANAGER_NOT_NEEDED' : 'RETURN',
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: input.head ? 'MANAGER' : 'EMPLOYEE',
          referenceKind: 'RETURN_REQUEST',
          referenceId: input.returnRequestId,
          note: input.reason,
        },
        now: input.now,
      });
    } catch (error) {
      if (error instanceof AssignmentNotOpenError) {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'NOT_OPEN');
      }
      if (error instanceof RevocationRefusedError && error.problem === 'ASSIGNMENT_IS_SERVICE_ACCOUNT') {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'SERVICE_ACCOUNT');
      }
      if (error instanceof RevocationRefusedError && error.problem === 'TYPE_NOT_SUPPORTED') {
        throw new ReturnRequestRefusedError('ASSIGNMENT_NOT_RETURNABLE', 'PLAN_NOT_SUPPORTED');
      }
      throw error;
    }
  }
}
