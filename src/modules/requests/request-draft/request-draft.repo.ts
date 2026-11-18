import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AccessRequestBranchCode } from '../access-request/access-request.policy';
import { draftPolicyJson, type DraftPolicy } from './request-draft-policy.json';
import { draftVerdict, type DraftVerdict } from './request-draft.policy';

/** A request being drafted as the draft operations read it. */
export interface DraftRow {
  id: string;
  organizationId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  state: string;
  planId: string | null;
  requesterEmployeeId: string;
  departmentId: string;
  /** What the sender filled, kept as it was validated: `{ draft: { kind, ...body } }`; nothing else of the policy exists yet. */
  policy: unknown;
  /** When it was saved: a draft is never changed (a change is a deletion and a new draft), so this is the day it was made. */
  savedAt: Date;
}

export interface NewDraft {
  organizationId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'GROUP_GRANT';
  branch: AccessRequestBranchCode;
  planId: string;
  requesterEmployeeId: string;
  departmentId: string;
  businessReason: string;
  /** A draft keeps no term: the end date, when there is one, is in its content. */
  termMonths: number | null;
  /** The content the draft is sent from (`policy.draft`). */
  content: DraftPolicy['draft'];
  createdByAppUserId: string;
}

const SELECT_DRAFT = {
  id: true,
  organizationId: true,
  type: true,
  state: true,
  planId: true,
  requesterEmployeeId: true,
  departmentId: true,
  policy: true,
  updatedAt: true,
} satisfies Prisma.AccessRequestSelect;

type Row = Prisma.AccessRequestGetPayload<{ select: typeof SELECT_DRAFT }>;

const toDraft = (row: Row): DraftRow => ({
  id: row.id,
  organizationId: row.organizationId,
  type: row.type,
  state: row.state,
  planId: row.planId,
  requesterEmployeeId: row.requesterEmployeeId,
  departmentId: row.departmentId,
  policy: row.policy,
  savedAt: row.updatedAt,
});

/**
 * The drafts of paid requests: a row of `access_requests` in the state `DRAFT`, written before the finance gates, with no
 * Cost Center, no moment it was sent, no price, no step, no check and no commitment (the table refuses all of them). It is read and
 * written only here and by `AccessRequestRepo.insert`, which turns the row into the request when the draft is sent; every other read
 * of requests leaves drafts out. A draft carries no person and no line of its own: what it is for is kept with the content it is sent
 * from, so nothing that lists the people of a request can meet one.
 */
@Injectable()
export class RequestDraftRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Saves the draft: it has no Cost Center and no moment it was sent, and its price columns are the ones a request has before it is priced. */
  async insert(tx: DbTx, input: NewDraft): Promise<DraftRow> {
    const created = await tx.accessRequest.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        branch: input.branch,
        state: 'DRAFT',
        planId: input.planId,
        requesterEmployeeId: input.requesterEmployeeId,
        departmentId: input.departmentId,
        costCenterId: null,
        businessReason: input.businessReason,
        termMonths: input.termMonths,
        policy: draftPolicyJson.encode({ draft: input.content }),
        createdByAppUserId: input.createdByAppUserId,
        submittedAt: null,
      },
      select: SELECT_DRAFT,
    });

    return toDraft(created);
  }

  /** The drafts of one person, the newest first and then by id: a page of them and how many there are in all. */
  async pageOf(
    requesterEmployeeId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: DraftRow[]; total: number }> {
    const where = { requesterEmployeeId, state: 'DRAFT' as const };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accessRequest.findMany({
        where,
        select: SELECT_DRAFT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.accessRequest.count({ where }),
    ]);

    return { items: rows.map(toDraft), total };
  }

  /** The request, draft or not, by its id; null when none. The caller judges whose it is and whether it is still a draft. */
  async find(id: string, tx?: DbTx): Promise<DraftRow | null> {
    const row = await (tx ?? this.prisma).accessRequest.findUnique({ where: { id }, select: SELECT_DRAFT });

    return row ? toDraft(row) : null;
  }

  /**
   * Locks the request `FOR UPDATE` until the transaction ends, so a draft that is sent, deleted or removed with its sender's departure
   * is decided by one transaction at a time, and says what the caller meets: theirs and still a draft, not theirs or not there, or
   * theirs and sent already (`draftVerdict`).
   */
  async lockOwned(tx: DbTx, id: string, employeeId: string): Promise<DraftVerdict> {
    const rows = await tx.$queryRaw<{ requester_employee_id: string; state: string }[]>`
      SELECT requester_employee_id, state::text AS state FROM access_requests WHERE id = ${id}::uuid FOR UPDATE`;

    return draftVerdict(
      rows.length === 0 ? null : { requesterEmployeeId: rows[0].requester_employee_id, state: rows[0].state },
      employeeId,
    );
  }

  /**
   * Locks the drafts of one person, in the order of their ids, and reads them: the ones that go when the person leaves
   * (`US-03-04`); locked like the draft operations lock them, so none is sent while it is being removed.
   */
  async lockOfRequester(tx: DbTx, requesterEmployeeId: string): Promise<DraftRow[]> {
    await tx.$queryRaw`
      SELECT id FROM access_requests WHERE requester_employee_id = ${requesterEmployeeId}::uuid AND state = 'DRAFT'::"AccessRequestState"
       ORDER BY id FOR UPDATE`;
    const rows = await tx.accessRequest.findMany({
      where: { requesterEmployeeId, state: 'DRAFT' },
      select: SELECT_DRAFT,
      orderBy: { id: 'asc' },
    });

    return rows.map(toDraft);
  }

  /** Deletes the draft with every row that hangs from it, in one go. The caller holds its lock and has judged that it is a draft. */
  async delete(tx: DbTx, id: string): Promise<void> {
    await tx.accessRequestBeneficiary.deleteMany({ where: { requestId: id } });
    await tx.accessRequest.delete({ where: { id, state: 'DRAFT' } });
  }
}
