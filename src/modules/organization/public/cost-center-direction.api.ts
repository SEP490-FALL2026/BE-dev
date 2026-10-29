import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { DirectionRefusedError } from './cost-center-direction.errors';
import { assertDirectionRules } from '../cost-center-direction/cost-center-direction.policy';
import { CostCenterDirectionRepo } from '../cost-center-direction/cost-center-direction.repo';
import type { ActivateCommand, ActivateResult, LinkCommand, LinkResult } from './cost-center-direction.types';

/**
 * The two procedures that finish the move of the Cost Center link (F01, `QĐ-87d(1)`, spec L.11): `activate` records, once,
 * that this installation runs the compatibility release, and `link` gives ONE Cost Center that has no department its
 * department on the basis Finance approved. Each is one transaction with an Audit Trail event; nothing is inferred and
 * nothing is written when anything is refused. There is no principal: the command is the operator's (`OPERATOR`).
 */
@Injectable()
export class CostCenterDirectionApi {
  constructor(
    private readonly repo: CostCenterDirectionRepo,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws DirectionRefusedError (nothing was written). */
  async activate(command: ActivateCommand): Promise<ActivateResult> {
    assertDirectionRules({
      environment: command.environment,
      approvedBy: command.approvedBy,
      operator: command.operator,
      releaseEvidence: command.releaseEvidence,
    });

    return this.runner.run(async (tx) => {
      if (!(await this.repo.schemaReady(tx))) throw new DirectionRefusedError('SCHEMA_NOT_READY');
      const organizationId = await this.repo.lockOrganization(tx);
      if (!organizationId) throw new DirectionRefusedError('NOT_INSTALLED');
      if (await this.repo.isActivated(tx, organizationId)) return { organizationId, outcome: 'ALREADY_ACTIVATED' };

      const created = await this.repo.insertActivation(tx, {
        organizationId,
        releaseEvidence: command.releaseEvidence,
        approvedBy: command.approvedBy,
        operator: command.operator,
        environment: command.environment,
      });
      await this.audit.record(tx, {
        organizationId,
        actorKind: 'OPERATOR',
        actorAppUserId: null,
        actorRoles: [],
        action: 'COST_CENTER_DIRECTION.ACTIVATED',
        resourceType: 'Organization',
        resourceId: organizationId,
        before: null,
        after: {
          releaseEvidence: command.releaseEvidence,
          approver: command.approvedBy,
          operator: command.operator,
          environment: command.environment,
        },
        correlationId: created.id,
        operatorReference: command.releaseEvidence,
      });

      return { organizationId, outcome: 'ACTIVATED' };
    });
  }

  /** Throws DirectionRefusedError (nothing was written). */
  async link(command: LinkCommand): Promise<LinkResult> {
    assertDirectionRules({
      environment: command.environment,
      approvedBy: command.approvedBy,
      operator: command.operator,
      basis: command.basis,
    });

    return this.runner.run(async (tx) => {
      if (!(await this.repo.schemaReady(tx))) throw new DirectionRefusedError('SCHEMA_NOT_READY');
      const organizationId = await this.repo.organizationOf(tx, command.costCenterId);
      if (!organizationId) throw new DirectionRefusedError('COST_CENTER_NOT_FOUND');

      // Lock order (T-11): the department, then the Cost Center, as `costCenterCreate` takes them for the same department.
      const department = await this.repo.lockDepartmentByCode(tx, organizationId, command.departmentCode);
      const costCenter = await this.repo.lockCostCenter(tx, command.costCenterId);
      if (!costCenter || costCenter.organizationId !== organizationId) {
        throw new DirectionRefusedError('COST_CENTER_NOT_FOUND');
      }
      if (!department) throw new DirectionRefusedError('DEPARTMENT_NOT_FOUND');

      // The same command run twice is the same answer.
      if (costCenter.departmentId !== null) {
        if (costCenter.departmentId !== department.id) throw new DirectionRefusedError('COST_CENTER_ALREADY_LINKED');

        return { costCenterId: costCenter.id, departmentId: department.id, outcome: 'ALREADY_LINKED' };
      }

      if (costCenter.status === 'ACTIVE') {
        if (department.status !== 'ACTIVE') throw new DirectionRefusedError('DEPARTMENT_NOT_ACTIVE');
        if (await this.repo.hasActiveCostCenter(tx, department.id)) {
          throw new DirectionRefusedError('DEPARTMENT_ALREADY_HAS_ACTIVE_COST_CENTER');
        }
      }

      const record = await this.repo.insertLinkRecord(tx, {
        organizationId,
        costCenterId: costCenter.id,
        departmentId: department.id,
        basis: command.basis,
        approvedBy: command.approvedBy,
        operator: command.operator,
        environment: command.environment,
      });
      const linkedAt = await this.repo.link(tx, costCenter.id, department.id);
      await this.audit.record(tx, {
        organizationId,
        actorKind: 'OPERATOR',
        actorAppUserId: null,
        actorRoles: [],
        action: 'COST_CENTER.DEPARTMENT_LINKED_BY_PROCEDURE',
        resourceType: 'CostCenter',
        resourceId: costCenter.id,
        before: { departmentId: null, linkedAt: null },
        after: {
          departmentId: department.id,
          linkedAt: linkedAt.toISOString(),
          linkId: record.id,
          basis: command.basis,
          approver: command.approvedBy,
          operator: command.operator,
          environment: command.environment,
        },
        correlationId: record.id,
        operatorReference: command.basis,
      });

      return { costCenterId: costCenter.id, departmentId: department.id, outcome: 'LINKED' };
    });
  }
}
