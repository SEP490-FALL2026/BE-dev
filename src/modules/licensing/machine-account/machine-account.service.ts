import { Injectable } from '@nestjs/common';
import { readSqlState, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentRepo } from '../assignment/assignment.repo';
import { toAssignmentView } from '../assignment/assignment.policy';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { AssignmentNotFoundError } from '../public/licensing.errors';
import type { AssignmentRecord, AssignmentView } from '../public/licensing.types';
import { MachineAccountOverlapError, MachineAccountRefusedError } from './machine-account.errors';
import {
  machineAccountOutcome,
  machineAccountRefusal,
  type MachineAccountChange,
  type MachineAccountOutcome,
} from './machine-account.policy';

const AUDIT_ACTION: Record<Exclude<MachineAccountOutcome, 'UNCHANGED'>, string> = {
  FLAG_ON: 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_FLAGGED',
  NOTE_CHANGED: 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_NOTE_CHANGED',
  FLAG_OFF: 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_UNFLAGGED',
};

/**
 * Turning the flag "used for a machine account" of a seat on or off (`QĐ-110m`, `R-9`): the IT Admin says a personal seat of an IT Admin
 * is a pipeline, a bot or a shared login, and the seat then no longer counts for INV-02, so the IT Admin keeps their own personal seat of
 * the same subscription. The seat is locked, judged (`machineAccountRefusal`), written and audited in one transaction; asking for what
 * already is writes nothing. Turning the flag off while the person holds another personal seat of the subscription for an overlapping
 * period is refused by the database (23P01) and answered as `MachineAccountOverlapError`. The audit event carries neither the account
 * identifier nor the reason.
 */
@Injectable()
export class MachineAccountService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly assignments: AssignmentRepo,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws AssignmentNotFoundError, MachineAccountRefusedError and MachineAccountOverlapError. */
  async change(
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    change: MachineAccountChange,
  ): Promise<AssignmentView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The flag of a machine account was changed before installation');

    return this.runner.run(async (tx) => {
      const current = await this.assignments.lock(tx, assignmentId);
      if (!current) throw new AssignmentNotFoundError();
      const holders = await this.identity.findUsableItAdminEmployeeIds([current.employeeId], tx);
      const refusal = machineAccountRefusal(current, holders.has(current.employeeId), change);
      if (refusal) throw new MachineAccountRefusedError(refusal);
      const outcome = machineAccountOutcome(current, change);
      if (outcome === 'UNCHANGED') return toAssignmentView(current);

      let updated: AssignmentRecord;
      try {
        updated = await this.assignments.setMachineAccount(tx, current.id, change);
      } catch (error) {
        if (readSqlState(error) === '23P01') throw new MachineAccountOverlapError();
        throw error;
      }
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          AUDIT_ACTION[outcome],
          'LicenseAssignment',
          current.id,
          { isMachineAccount: current.isMachineAccount },
          {
            isMachineAccount: updated.isMachineAccount,
            employeeId: updated.employeeId,
            subscriptionId: updated.subscriptionId,
          },
        ),
      );

      return toAssignmentView(updated);
    });
  }
}
