import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AssignmentRefusedError } from './subscription-owner-assignment.errors';
import { SubscriptionOwnerAssignmentRepo } from '../subscription-owner-assignment/subscription-owner-assignment.repo';
import type { AssignmentCommand, AssignmentResult } from './subscription-owner-assignment.types';

/**
 * Gives ONE existing subscription its owner department on a stated basis, in one transaction:
 * the subscription is locked, the department is the active one the operator named by its code, the row of the basis is
 * written and the Audit Trail event commits with it. Nothing is inferred and nothing is written when anything is refused.
 * There is no principal: the command is the operator's, and the Audit Trail says so (`OPERATOR`).
 */
@Injectable()
export class SubscriptionOwnerAssignmentApi {
  constructor(
    private readonly repo: SubscriptionOwnerAssignmentRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws AssignmentRefusedError (nothing was written). */
  async assign(command: AssignmentCommand): Promise<AssignmentResult> {
    return this.runner.run(async (tx) => {
      if (!(await this.repo.schemaReady(tx))) throw new AssignmentRefusedError('SCHEMA_NOT_READY');
      const subscription = await this.repo.lockSubscription(tx, command.subscriptionId);
      if (!subscription) throw new AssignmentRefusedError('SUBSCRIPTION_NOT_FOUND');
      const department = await this.organization.lockDepartmentForEntry(
        tx,
        subscription.organizationId,
        command.departmentCode,
      );
      if (!department) throw new AssignmentRefusedError('DEPARTMENT_NOT_ACTIVE');

      // The same command run twice is the same answer, even if the department was stopped in between.
      const existing = await this.repo.findAssignment(tx, subscription.id);
      if (existing) {
        if (existing.departmentId !== department.id) throw new AssignmentRefusedError('OWNER_ALREADY_SET');

        return { subscriptionId: subscription.id, departmentId: department.id, outcome: 'ALREADY_ASSIGNED' };
      }
      if (!department.active) throw new AssignmentRefusedError('DEPARTMENT_NOT_ACTIVE');
      if (subscription.ownerDepartmentId !== null) throw new AssignmentRefusedError('OWNER_ALREADY_SET');

      const created = await this.repo.insert(tx, {
        organizationId: subscription.organizationId,
        subscriptionId: subscription.id,
        departmentId: department.id,
        basis: command.basis,
        operator: command.operator,
        environment: command.environment,
      });
      await this.audit.record(tx, {
        organizationId: subscription.organizationId,
        actorKind: 'OPERATOR',
        actorAppUserId: null,
        actorRoles: [],
        action: 'SUBSCRIPTION_OWNER_ASSIGNMENT.RECORDED',
        resourceType: 'Subscription',
        resourceId: subscription.id,
        before: null,
        after: {
          subscriptionId: subscription.id,
          departmentId: department.id,
          basis: command.basis,
          operator: command.operator,
          environment: command.environment,
        },
        correlationId: created.id,
        operatorReference: command.basis,
      });

      return { subscriptionId: subscription.id, departmentId: department.id, outcome: 'ASSIGNED' };
    });
  }
}
