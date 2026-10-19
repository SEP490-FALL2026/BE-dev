import { Injectable } from '@nestjs/common';
import { DbTx, readSqlState } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { operatorEvent } from './recovery-procedure';
import { RecoveryRefusedError } from './recovery.errors';
import { RecoveryRepo, TicketRecord } from './recovery.repo';
import { RecoveryContext, RecoveryResult } from './recovery.types';

/**
 * The last step of a role transfer (AC-12): the Super Admin role leaves the holder (if anyone holds it) and reaches the
 * activated successor in one transaction, so there is never a moment with two holders or none. The ticket completes.
 */
@Injectable()
export class RoleHandover {
  constructor(
    private readonly grants: RoleGrantService,
    private readonly tickets: RecoveryRepo,
    private readonly audit: AuditService,
  ) {}

  async move(
    tx: DbTx,
    input: {
      context: RecoveryContext;
      organizationId: string;
      ticket: TicketRecord;
      holderId: string | null;
      successorAccountId: string;
      now: Date;
    },
  ): Promise<RecoveryResult> {
    const { context, organizationId, ticket, holderId, successorAccountId, now } = input;
    const holderRoles = holderId ? await this.grants.effectiveRoles(holderId, tx) : [];
    if (holderId) {
      await this.grants.revokeRole(tx, {
        appUserId: holderId,
        role: 'SUPER_ADMIN',
        revokedBy: holderId,
        now,
      });
    }
    try {
      await this.grants.grantRole(tx, {
        organizationId,
        appUserId: successorAccountId,
        role: 'SUPER_ADMIN',
      });
    } catch (error) {
      if (readSqlState(error) === '23514') throw new RecoveryRefusedError('WORK_ROLE_HELD');
      throw error;
    }
    await this.tickets.setStatus(tx, ticket.id, 'COMPLETED', now);
    const successorRoles = await this.grants.effectiveRoles(successorAccountId, tx);
    if (holderId) {
      await this.audit.record(
        tx,
        operatorEvent(
          context,
          organizationId,
          ticket,
          'SUPER_ADMIN.TRANSFERRED_OUT',
          holderId,
          { roles: holderRoles },
          { roles: holderRoles.filter((role) => role !== 'SUPER_ADMIN') },
        ),
      );
    }
    await this.audit.record(
      tx,
      operatorEvent(
        context,
        organizationId,
        ticket,
        'SUPER_ADMIN.TRANSFERRED_IN',
        successorAccountId,
        { roles: successorRoles.filter((role) => role !== 'SUPER_ADMIN') },
        { roles: successorRoles },
      ),
    );

    return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'ROLE_TRANSFERRED' };
  }
}
