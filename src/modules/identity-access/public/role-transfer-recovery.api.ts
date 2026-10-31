import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { employeeHasNotLeft } from '../accounts/account.policy';
import { assertContext, assertSeparation, checkSameTicket } from '../recovery/recovery-procedure.policy';
import { RecoveryTargets } from '../recovery/recovery-targets.service';
import { RecoveryRefusedError } from './recovery.errors';
import { RecoveryRepo } from '../recovery/recovery.repo';
import { RecoveryContext, RecoveryResult } from './recovery.types';
import { RoleHandover } from '../recovery/role-handover.service';
import { SuccessorEnrolment } from '../recovery/successor-enrolment.service';

/**
 * Handing the Super Admin role to a person when the holder cannot act any more (`US-01-09` AC-12): left, locked, or
 * nobody holds it. Run by an operator outside the application. Two stages, one ticket: the first creates the
 * successor's account, which has no role, and invites them; once they have activated it, the same ticket run again
 * moves the role in one transaction. Locks: the employees (by id), then the accounts (by id), then the ticket.
 */
@Injectable()
export class RoleTransferRecoveryApi {
  constructor(
    private readonly targets: RecoveryTargets,
    private readonly organization: OrganizationApi,
    private readonly tickets: RecoveryRepo,
    private readonly enrolment: SuccessorEnrolment,
    private readonly handover: RoleHandover,
    private readonly runner: TransactionRunner,
  ) {}

  async transferRole(
    context: RecoveryContext,
    input: { successorEmployeeCode: string; holderEmail?: string },
  ): Promise<RecoveryResult> {
    assertContext(context);
    const organization = await this.targets.requireOrganization();
    const successorEmployee = await this.organization.getEmployeeByCode(input.successorEmployeeCode);
    if (!successorEmployee) throw new RecoveryRefusedError('SUCCESSOR_NOT_FOUND');
    const holder = input.holderEmail ? await this.targets.locateByEmail(organization.id, input.holderEmail) : null;
    assertSeparation(context, [
      successorEmployee.workEmail ?? '',
      input.holderEmail ?? '',
      successorEmployee.employeeCode,
    ]);

    return this.runner.run(async (tx) => {
      const successorAccountId = await this.targets.lockForTransfer(tx, successorEmployee.id, holder);

      // A completed transfer is run again after the role has moved: the named holder is no longer the holder.
      const completed = await this.tickets.findCompleted(tx, organization.id, context.ticketRef);
      if (completed) {
        if (completed.mode !== 'TRANSFER_ROLE') throw new RecoveryRefusedError('TICKET_OF_ANOTHER_KIND');
        if (completed.successorEmployeeId !== successorEmployee.id)
          throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');

        return { ticketRef: context.ticketRef, mode: 'TRANSFER_ROLE', outcome: 'ALREADY_COMPLETED' };
      }

      const current = await this.targets.readHolder(tx, holder?.id ?? null);
      const holderUsable =
        current.account !== null &&
        current.account.status === 'ACTIVE' &&
        current.account.activationState === 'ACTIVATED' &&
        employeeHasNotLeft(current.employee);
      if (holderUsable) throw new RecoveryRefusedError('HOLDER_STILL_USABLE');
      if (current.account && current.account.employeeId === successorEmployee.id) {
        throw new RecoveryRefusedError('SUCCESSOR_IS_HOLDER');
      }
      const successor = await this.organization.getEmployee(successorEmployee.id, tx);
      if (!successor || successor.status !== 'ACTIVE') throw new RecoveryRefusedError('EMPLOYEE_NOT_WORKING');

      const { ticket, created } = await this.tickets.openAndLock(tx, {
        organizationId: organization.id,
        ticketRef: context.ticketRef,
        mode: 'TRANSFER_ROLE',
        targetAppUserId: current.holderId,
        successorEmployeeId: successor.id,
        recipientEmail: successor.workEmail,
        newLoginEmail: null,
        approverRef: context.approverRef,
        operatorRef: context.operatorRef,
        identityCheckRef: context.identityCheckRef ?? null,
        environment: context.environment,
      });
      if (!created) {
        const verdict = checkSameTicket(ticket, 'TRANSFER_ROLE', { targetAppUserId: current.holderId });
        if (verdict) return verdict;
        if (ticket.successorEmployeeId !== successor.id) throw new RecoveryRefusedError('TICKET_PARAMETERS_DIFFER');
      }
      const now = new Date();
      const step = { context, organizationId: organization.id, ticket, now };

      // Stage 1: the successor has no account yet.
      if (successorAccountId === null) return this.enrolment.createAccount(tx, { ...step, successor });

      // Stage 2, or the wait for it: the successor has an account.
      const waiting = await this.enrolment.awaitActivation(tx, { ...step, successorAccountId, successor });
      if (waiting) return waiting;

      return this.handover.move(tx, { ...step, holderId: current.holderId, successorAccountId });
    });
  }
}
