import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DepartmentSoftwareItem } from './department-software.policy';
import type {
  ProposalFilter,
  ProposalState,
  SoftwareEntry,
  SoftwareEntryDraft,
  SoftwareProposal,
} from './department-software.types';

type EntryRow = {
  id: string;
  organizationId: string;
  departmentId: string;
  applicationId: string;
  planId: string | null;
  note: string | null;
  addedAt: Date;
};

type ProposalRow = {
  id: string;
  organizationId: string;
  departmentId: string;
  applicationId: string;
  planId: string | null;
  reason: string;
  state: ProposalState;
  proposedByEmployeeId: string;
  proposedAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
};

const toEntry = (row: EntryRow): SoftwareEntry => ({
  id: row.id,
  organizationId: row.organizationId,
  departmentId: row.departmentId,
  applicationId: row.applicationId,
  planId: row.planId,
  note: row.note,
  addedAt: row.addedAt,
});

const toProposal = (row: ProposalRow): SoftwareProposal => ({
  id: row.id,
  organizationId: row.organizationId,
  departmentId: row.departmentId,
  applicationId: row.applicationId,
  planId: row.planId,
  reason: row.reason,
  state: row.state,
  proposedByEmployeeId: row.proposedByEmployeeId,
  proposedAt: row.proposedAt,
  decidedAt: row.decidedAt,
  decisionReason: row.decisionReason,
});

/**
 * The reads and writes of the list of software of a department and of the proposals to add to it (`QĐ-110s`, `QĐ-110t`, DS.1). Every
 * insert is `ON CONFLICT DO NOTHING` and says what it wrote: the unique indexes decide a duplicate or a second open proposal, so two
 * writers that arrive together leave one row and a refusal for the other, never a check before the insert, and a duplicate never aborts
 * the transaction of the caller. A page is read from one snapshot with its total.
 */
@Injectable()
export class DepartmentSoftwareRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of the list of a department, newest first and then by id (so the pages are stable), and the total, from one snapshot. */
  pageEntries(departmentId: string, skip: number, take: number): Promise<{ items: SoftwareEntry[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.departmentSoftwareEntry.findMany({
          where: { departmentId },
          orderBy: [{ addedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        });

        return { items: rows.map(toEntry), total: await tx.departmentSoftwareEntry.count({ where: { departmentId } }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The places of this department with these ids, as far as they exist in it (an id of another department is absent). */
  async findEntries(tx: DbTx, departmentId: string, ids: readonly string[]): Promise<SoftwareEntry[]> {
    const rows = await tx.departmentSoftwareEntry.findMany({
      where: { departmentId, id: { in: [...ids] } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toEntry);
  }

  /** The place with this application and plan in the department, or null. */
  async findEntryByPlace(tx: DbTx, departmentId: string, item: DepartmentSoftwareItem): Promise<SoftwareEntry | null> {
    const row = await tx.departmentSoftwareEntry.findFirst({
      where: { departmentId, applicationId: item.applicationId, planId: item.planId },
    });

    return row && toEntry(row);
  }

  /** Writes the places that are not in the list yet and returns those it wrote; a place already there is left as it is and is not returned. */
  async insertEntries(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      addedByAppUserId: string;
      items: readonly SoftwareEntryDraft[];
    },
  ): Promise<SoftwareEntry[]> {
    const rows = await tx.departmentSoftwareEntry.createManyAndReturn({
      data: input.items.map((item) => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        applicationId: item.applicationId,
        planId: item.planId,
        note: item.note,
        addedByAppUserId: input.addedByAppUserId,
      })),
      skipDuplicates: true,
    });

    return rows.map(toEntry);
  }

  /** Takes these places out of the department and says how many went; the caller compares it with what it asked. */
  async deleteEntries(tx: DbTx, departmentId: string, ids: readonly string[]): Promise<number> {
    const { count } = await tx.departmentSoftwareEntry.deleteMany({ where: { departmentId, id: { in: [...ids] } } });

    return count;
  }

  /** The proposal with this id, or null. */
  async findProposal(id: string, tx?: DbTx): Promise<SoftwareProposal | null> {
    const row = await (tx ?? this.prisma).departmentSoftwareProposal.findUnique({ where: { id } });

    return row && toProposal(row);
  }

  /**
   * Opens a proposal; null when one is already open (`PENDING`) for the same place in the department: the partial unique index
   * decides, `ON CONFLICT DO NOTHING` writes nothing and the caller answers a conflict.
   */
  async insertProposal(
    tx: DbTx,
    input: {
      organizationId: string;
      departmentId: string;
      item: DepartmentSoftwareItem;
      reason: string;
      proposedByEmployeeId: string;
    },
  ): Promise<SoftwareProposal | null> {
    const [row] = await tx.departmentSoftwareProposal.createManyAndReturn({
      data: [
        {
          id: randomUUID(),
          organizationId: input.organizationId,
          departmentId: input.departmentId,
          applicationId: input.item.applicationId,
          planId: input.item.planId,
          reason: input.reason,
          proposedByEmployeeId: input.proposedByEmployeeId,
        },
      ],
      skipDuplicates: true,
    });

    return row ? toProposal(row) : null;
  }

  /**
   * Decides an open proposal and says whether it did: the row is changed only while it is still `PENDING`, and the update holds the row, so
   * two IT Admins who decide together leave one decision and `false` for the other.
   */
  async decide(
    tx: DbTx,
    id: string,
    decision: { state: 'ACCEPTED' | 'REJECTED'; byAppUserId: string; at: Date; reason: string | null },
  ): Promise<boolean> {
    const { count } = await tx.departmentSoftwareProposal.updateMany({
      where: { id, state: 'PENDING' },
      data: {
        state: decision.state,
        decidedByAppUserId: decision.byAppUserId,
        decidedAt: decision.at,
        decisionReason: decision.reason,
      },
    });

    return count === 1;
  }

  /** One page of proposals, newest first and then by id, and the total, from one snapshot. */
  pageProposals(
    filter: ProposalFilter,
    skip: number,
    take: number,
  ): Promise<{ items: SoftwareProposal[]; total: number }> {
    const where: Prisma.DepartmentSoftwareProposalWhereInput = {
      ...(filter.departmentIds === null ? {} : { departmentId: { in: [...filter.departmentIds] } }),
      ...(filter.departmentId ? { AND: [{ departmentId: filter.departmentId }] } : {}),
      ...(filter.state ? { state: filter.state } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.departmentSoftwareProposal.findMany({
          where,
          orderBy: [{ proposedAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        });

        return { items: rows.map(toProposal), total: await tx.departmentSoftwareProposal.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
