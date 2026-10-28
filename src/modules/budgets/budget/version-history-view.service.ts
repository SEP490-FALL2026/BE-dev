import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetNotAHistoryReaderError, BudgetVersionNotFoundError } from './budget.errors';
import { deciderOf } from './budget.policy';
import { BudgetSupportService } from './budget-support.service';
import { changesOf } from './version-history.policy';
import { VersionHistoryRepo, type HistoryEntryRecord } from './version-history.repo';
import { ProposalRepo } from './proposal.repo';
import { VersionRepo, type VersionRecord } from './version.repo';
import type { HistoryEntryWire } from './budget-history.dto';

/**
 * The history of the edits of a version, read by Finance and by the person who decides the version now, as `decide` finds them:
 * the spending approver, or the substitute when the approver sent the proposal behind it (F66, spec J.4). Whoever else asks is
 * refused here, not by the route. The history is its own table; the Audit Trail is never read for it.
 */
@Injectable()
export class VersionHistoryViewService {
  constructor(
    private readonly versions: VersionRepo,
    private readonly entries: VersionHistoryRepo,
    private readonly proposals: ProposalRepo,
    private readonly support: BudgetSupportService,
  ) {}

  /** Throws BudgetNotAHistoryReaderError and BudgetVersionNotFoundError. */
  async list(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<HistoryEntryWire>> {
    const version = await this.versions.findById(id);
    await this.requireReader(actor, version);
    if (!version) throw new BudgetVersionNotFoundError();

    const { items, total } = await this.entries.page(id, (query.page - 1) * query.pageSize, query.pageSize);
    const people = await this.support.people(items.map((entry) => entry.changedByEmployeeId));

    return pageOf(
      items.map((entry) => toWire(entry, version, people.get(entry.changedByEmployeeId)?.fullName ?? '')),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * Finance, or whoever decides the version now. Someone else is refused whether the version exists or not, so the answer does not
   * say which versions there are.
   */
  private async requireReader(actor: AuthenticatedPrincipal, version: VersionRecord | null): Promise<void> {
    if (actor.roles.includes('FINANCE')) return;
    const proposal = version?.proposalId ? await this.proposals.findById(version.proposalId) : null;
    const decider = deciderOf(await this.support.holders(), proposal?.submittedByEmployeeId ?? null);
    if (decider.employeeId === null || decider.employeeId !== actor.employeeId)
      throw new BudgetNotAHistoryReaderError();
  }
}

const toWire = (entry: HistoryEntryRecord, version: VersionRecord, by: string): HistoryEntryWire => ({
  seq: entry.seq,
  kind: entry.kind,
  versionState: entry.versionState,
  position: entry.position,
  lines:
    entry.fromPosition !== null && entry.toPosition !== null && entry.lineCount !== null
      ? { fromPosition: entry.fromPosition, toPosition: entry.toPosition, count: entry.lineCount }
      : null,
  changes: Array.isArray(entry.after) ? [] : changesOf(entry.before, entry.after),
  currency: version.currency,
  by: { id: entry.changedByEmployeeId, name: by },
  at: entry.changedAt.toISOString(),
});
