import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetProposalNotFoundError, BudgetVersionNotFoundError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { ProposalRepo } from '../budget/proposal.repo';
import { VersionRepo } from '../budget/version.repo';
import type { BudgetAttachmentSummaryWire, BudgetUploadSummaryWire } from './budget-attachment.dto';
import { BudgetAttachmentNotAReaderError } from './budget-attachment.errors';
import { toBudgetAttachmentSummaryWire, toBudgetUploadSummaryWire } from './budget-attachment.mapper';
import { budgetRecordView } from './budget-attachment.policy';
import { BudgetAttachmentRepo } from './budget-attachment.repo';

@Injectable()
export class BudgetAttachmentQueryService {
  constructor(
    private readonly attachments: BudgetAttachmentRepo,
    private readonly facts: BudgetFactsService,
    private readonly proposals: ProposalRepo,
    private readonly versions: VersionRepo,
  ) {}

  async listProposalAttachments(
    actor: AuthenticatedPrincipal,
    proposalId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<BudgetAttachmentSummaryWire>> {
    const today = await this.facts.today(new Date());
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal) throw new BudgetProposalNotFoundError();

    const isFinance = actor.roles.includes('FINANCE');
    const isDecider = await this.facts.isSpendingApprover(actor.employeeId);
    const headedCostCenterIds = await this.facts.headedCostCenters(actor.employeeId, today);

    const view = budgetRecordView({
      isFinance,
      isDecider,
      headedCostCenterIds,
      recordCostCenterId: proposal.costCenterId,
      versionSentAt: undefined,
    });

    if (view === 'NONE') {
      throw new BudgetProposalNotFoundError();
    }

    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;
    const { items, totalItems } = await this.attachments.pageByProposal(proposalId, { skip, take });
    const uploaders = await this.facts.people(items.map((i) => i.uploadedByEmployeeId));

    const wires = items.map((i) => toBudgetAttachmentSummaryWire(i, uploaders.get(i.uploadedByEmployeeId) ?? null));
    return pageOf(wires, totalItems, query.page, query.pageSize);
  }

  async listVersionAttachments(
    actor: AuthenticatedPrincipal,
    versionId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<BudgetAttachmentSummaryWire>> {
    const today = await this.facts.today(new Date());
    const isFinance = actor.roles.includes('FINANCE');
    const isDecider = await this.facts.isSpendingApprover(actor.employeeId);
    const headedCostCenterIds = await this.facts.headedCostCenters(actor.employeeId, today);

    if (!isFinance && !isDecider && headedCostCenterIds.length === 0) {
      throw new BudgetAttachmentNotAReaderError();
    }

    const version = await this.versions.findById(versionId);
    if (!version) throw new BudgetVersionNotFoundError();

    const view = budgetRecordView({
      isFinance,
      isDecider,
      headedCostCenterIds,
      recordCostCenterId: version.costCenterId,
      versionSentAt: version.sentAt,
    });

    if (view === 'NONE') {
      throw new BudgetVersionNotFoundError();
    }

    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;
    const { items, totalItems } =
      view === 'AS_LAST_SENT'
        ? await this.attachments.pageByVersionAsLastSent(versionId, version.sentAt!, { skip, take })
        : await this.attachments.pageByVersionFull(versionId, { skip, take });

    const uploaders = await this.facts.people(items.map((i) => i.uploadedByEmployeeId));

    const wires = items.map((i) =>
      toBudgetAttachmentSummaryWire(
        i,
        uploaders.get(i.uploadedByEmployeeId) ?? null,
        view === 'AS_LAST_SENT' ? { status: 'ATTACHED', removedAt: null } : undefined,
      ),
    );
    return pageOf(wires, totalItems, query.page, query.pageSize);
  }

  async listMine(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<BudgetUploadSummaryWire>> {
    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;
    const { items, totalItems } = await this.attachments.pageMine(actor.employeeId, { skip, take });

    const wires = items.map(toBudgetUploadSummaryWire);
    return pageOf(wires, totalItems, query.page, query.pageSize);
  }
}
