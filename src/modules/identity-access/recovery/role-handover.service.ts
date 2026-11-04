import { Injectable } from '@nestjs/common';
import { DbTx, readSqlState } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { RoleGrantService } from '../accounts/role-grant.service';
import { operatorEvent } from './recovery-procedure.policy';
import { RecoveryRefusedError } from '../public/recovery.errors';
import { RecoveryRepo, TicketRecord } from './recovery.repo';
import { RecoveryContext, RecoveryResult } from '../public/recovery.types';

/**
 * The last step of a role transfer (AC-12): the Super Admin role leaves the holder (if anyone holds it) and reaches the
 * activated successor in one transaction, so there is never a moment with two holders or none. The ticket completes.
 */
@Injectable()
export class RoleHandover {
  constructor(
    private readonly grants: RoleGrantService,
    private readonly tickets: RecoveryRepo,
    private readonly audit: AuditApi,
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
    const successorRoles = await this.grants.effectiveRoles(successorAccountId, tx);
    if (holderId) {
      await this.grants.revokeRole(tx, {
        appUserId: holderId,
        role: 'SUPER_ADMIN',
        revokedBy: holderId,
        now,
      });
    }
    for (const role of successorRoles) {
      await this.grants.revokeRole(tx, {
        appUserId: successorAccountId,
        role,
        revokedBy: holderId ?? successorAccountId,
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
      if (readSqlState(error) === '23514') throw new RecoveryRefusedError('HEADS_DEPARTMENT');
      throw error;
    }
    await this.tickets.setStatus(tx, ticket.id, 'COMPLETED', now);
    if (holderId) {
      await this.grants.grantRole(tx, { organizationId, appUserId: holderId, role: 'EMPLOYEE' });
      await this.audit.record(
        tx,
        operatorEvent(
          context,
          organizationId,
          ticket,
          'SUPER_ADMIN.TRANSFERRED_OUT',
          holderId,
          { roles: holderRoles },
          { roles: ['EMPLOYEE'] },
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
        { roles: successorRoles },
        { roles: ['SUPER_ADMIN'] },
      ),
    );

    return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'ROLE_TRANSFERRED' };
  }
}
