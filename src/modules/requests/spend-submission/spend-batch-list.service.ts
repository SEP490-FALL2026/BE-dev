import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { CommittedAmount } from '../../budgets/public/budgets.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SpendBatchRepo, type BatchListRow } from '../spend/spend-batch.repo';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { SpendBatchListItemWire } from './spend-batch-list.dto';

/**
 * The batches the heads sent on as spend, read by Finance and only read (`US-06-14`): for each, how many of its requests have been
 * approved and what they were committed for, and how many still wait for a decision. A request that left the batch it was sent in
 * is counted in none of the two. The counts come from the requests; what was committed comes from the budgets, for the whole page at
 * once.
 */
@Injectable()
export class SpendBatchListService {
  constructor(
    private readonly batches: SpendBatchRepo,
    private readonly budgets: BudgetsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly wireView: SpendWireViewService,
  ) {}

  async page(query: {
    departmentId?: string;
    submittedFrom?: string;
    submittedTo?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<SpendBatchListItemWire>> {
    const { rows, decided, total } = await this.batches.pageForFinance({
      departmentId: query.departmentId,
      submittedFrom: query.submittedFrom ? new Date(query.submittedFrom) : undefined,
      submittedTo: query.submittedTo ? new Date(query.submittedTo) : undefined,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const requestIds = [...new Set(rows.flatMap((row) => row.items.map((item) => item.requestId)))];
    const [committed, departments, people] = await Promise.all([
      this.budgets.committedByRequests(requestIds),
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))]),
      this.wireView.people(rows.map((row) => row.submittedByEmployeeId)),
    ]);
    const units = await this.wireView.units(committed.map((entry) => entry.currency));
    const committedBy = new Map<string, CommittedAmount[]>();
    for (const entry of committed)
      committedBy.set(entry.requestId, [...(committedBy.get(entry.requestId) ?? []), entry]);
    const names = new Map(departments.map((department) => [department.id, department.name]));

    const items = rows.map((row): SpendBatchListItemWire => {
      const submittedBy = people.get(row.submittedByEmployeeId);
      const department = names.get(row.departmentId);
      if (!submittedBy || department === undefined) throw new Error(`The batch ${row.id} points at a missing record.`);

      return {
        id: row.id,
        department: { id: row.departmentId, name: department },
        submittedBy,
        submittedAt: row.submittedAt.toISOString(),
        itemCount: row.items.length,
        ...countsOf(row, decided, committedBy, units),
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}

/** The counts of one batch: an item that left the batch is in neither, and an approved one is a request that holds a commitment. */
function countsOf(
  row: BatchListRow,
  decided: ReadonlySet<string>,
  committedBy: ReadonlyMap<string, readonly CommittedAmount[]>,
  units: ReadonlyMap<string, number>,
): Pick<SpendBatchListItemWire, 'approvedCount' | 'pendingCount' | 'approvedAmounts'> {
  let approvedCount = 0;
  let pendingCount = 0;
  const sums = new Map<string, bigint>();
  for (const item of row.items) {
    if (item.leftAt !== null) continue;
    const commitments = committedBy.get(item.requestId);
    if (commitments) {
      approvedCount += 1;
      for (const commitment of commitments) {
        sums.set(commitment.currency, (sums.get(commitment.currency) ?? 0n) + commitment.amountMinor);
      }
    } else if (item.outcome !== 'STOPPED' && !decided.has(item.requestId)) {
      pendingCount += 1;
    }
  }

  const approvedAmounts: Record<string, string> = {};
  for (const [currency, minor] of sums) approvedAmounts[currency] = formatAmount(minor, units.get(currency) ?? 2);

  return { approvedCount, pendingCount, approvedAmounts };
}
