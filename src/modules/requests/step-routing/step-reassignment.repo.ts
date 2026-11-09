import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { requestPolicyJson } from '../access-request/access-request.json';
import type { ReassignableStepKind } from './reassignment.policy';

/** An open step as the reassignment reads it, with what the table of its kind needs to run again. */
export interface ReassignableStep {
  id: string;
  kind: ReassignableStepKind;
  sequence: number;
  state: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CLOSED' | 'NOT_REQUIRED';
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
  routingRow: number;
  samePersonAsSpend: boolean;
  createdAt: Date;
  waitingSince: Date | null;
}

/** A request with an open step, locked, as the reassignment reads it. */
export interface ReassignableRequest {
  id: string;
  organizationId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  /** Only the need step of a request for internal software with no fee follows where its requester is now (`FR-3.16`). */
  branch: 'INTERNAL_FREE' | 'PAID_IN_CATALOG' | 'NEW_SOFTWARE';
  state: string;
  requesterEmployeeId: string;
  /** The department the request was sent for: a paid request keeps it whoever holds a step later (`US-05-02` AC-7, `QĐ-90b`). */
  departmentId: string;
  /** Whether the chain has a spend step: only then can one person hold both it and the need step. */
  chainHasSpendStep: boolean;
  beneficiaryEmployeeIds: string[];
  /** The people of a request for a group and the step that holds each; empty for any other request. */
  lines: { employeeId: string; needStepId: string }[];
  steps: ReassignableStep[];
}

const OPEN = ['PENDING', 'WAITING'] as const;

const SELECT_REQUEST = {
  id: true,
  organizationId: true,
  type: true,
  branch: true,
  state: true,
  requesterEmployeeId: true,
  departmentId: true,
  policy: true,
  beneficiaries: { select: { employeeId: true }, orderBy: { position: 'asc' } },
  lines: { select: { employeeId: true, needStepId: true } },
  steps: {
    select: {
      id: true,
      kind: true,
      sequence: true,
      state: true,
      assigneeEmployeeId: true,
      waitingReason: true,
      routingRow: true,
      samePersonAsSpend: true,
      createdAt: true,
      waitingSince: true,
    },
    orderBy: { sequence: 'asc' },
  },
} satisfies Prisma.AccessRequestSelect;

type RequestRow = Prisma.AccessRequestGetPayload<{ select: typeof SELECT_REQUEST }>;

/** Only a request with an open step is read, and a draft has none (a trigger refuses it), so `policy` is always a `RequestPolicy`. */
function toRequest(row: RequestRow): ReassignableRequest {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    branch: row.branch,
    state: row.state,
    requesterEmployeeId: row.requesterEmployeeId,
    departmentId: row.departmentId,
    chainHasSpendStep: requestPolicyJson.decode(row.policy).chain.includes('SPEND_APPROVAL'),
    beneficiaryEmployeeIds: row.beneficiaries.map((beneficiary) => beneficiary.employeeId),
    lines: row.lines,
    // The review of Finance no longer exists: a step of that kind is a closed old one and is never looked at again (`QĐ-97c`).
    steps: row.steps.filter(
      (step): step is typeof step & { kind: ReassignableStepKind } => step.kind !== 'FINANCE_REVIEW',
    ),
  };
}

/**
 * The reads that name the requests an event may concern, the lock on them, and the one write of who holds an open step when
 * the organization or an approval role changed (`FR-3.16`). It writes the holder columns of `access_request_steps` and the
 * state of the request that follows from them, and nothing else of either: the decisions, the records and the chain stay with
 * the repositories of the capabilities that own them.
 */
@Injectable()
export class StepReassignmentRepo {
  constructor(private readonly prisma: PrismaService) {}

  async lockIds(tx: DbTx, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.$queryRaw`SELECT id FROM access_requests WHERE id = ANY(${[...new Set(ids)].sort()}::uuid[]) ORDER BY id FOR UPDATE`;
  }

  async hasOpenSpend(tx: DbTx, requestId: string): Promise<boolean> {
    return (
      (await tx.accessRequestStep.count({
        where: { requestId, kind: 'SPEND_APPROVAL', state: { in: ['PENDING', 'WAITING'] } },
      })) > 0
    );
  }

  async conversionDepartmentIds(tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).accessRequest.findMany({
      where: {
        routingMode: 'VIA_HEAD',
        branch: { not: 'INTERNAL_FREE' },
        state: { in: ['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'] },
      },
      distinct: ['departmentId'],
      select: { departmentId: true },
      orderBy: { departmentId: 'asc' },
    });
    return rows.map((row) => row.departmentId);
  }

  async conversionIds(departmentId: string, tx: DbTx): Promise<string[]> {
    const rows = await tx.accessRequest.findMany({
      where: {
        departmentId,
        routingMode: 'VIA_HEAD',
        branch: { not: 'INTERNAL_FREE' },
        state: { in: ['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'] },
        steps: { none: { kind: 'SPEND_APPROVAL', state: { in: ['PENDING', 'WAITING'] } } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  async markOneStep(tx: DbTx, id: string, now: Date): Promise<void> {
    await tx.accessRequest.update({ where: { id }, data: { routingMode: 'ONE_STEP', oneStepReason: 'HEAD_LEFT' } });
    await tx.accessRequestStep.updateMany({
      where: { requestId: id, kind: 'NEED', state: { in: ['PENDING', 'WAITING'] } },
      data: {
        state: 'CLOSED',
        decidedAt: now,
        waitingReason: null,
        waitingSince: null,
        samePersonAsSpend: false,
        noIndependentReview: false,
      },
    });
    await tx.accessRequestLine.updateMany({
      where: { requestId: id, state: 'AWAITING_NEED' },
      data: { state: 'NEED_CONFIRMED' },
    });
  }

  async oneStepPendingIds(): Promise<string[]> {
    const rows = await this.prisma.accessRequest.findMany({
      where: {
        routingMode: 'ONE_STEP',
        state: { in: ['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'] },
        steps: { none: { kind: 'SPEND_APPROVAL', state: { in: ['PENDING', 'WAITING'] } } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  // --- which requests an event may concern ---------------------------------------------------------------

  /** The requests that have a step waiting under control. */
  async waitingRequestIds(client: DbTx | PrismaService = this.prisma): Promise<string[]> {
    const rows = await client.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT request_id FROM access_request_steps WHERE state = 'WAITING'::"AccessRequestStepState" ORDER BY request_id`;

    return rows.map((row) => row.request_id);
  }

  /** The requests with a step held by one of these people. */
  async requestIdsHeldBy(
    employeeIds: readonly string[],
    client: DbTx | PrismaService = this.prisma,
  ): Promise<string[]> {
    if (employeeIds.length === 0) return [];
    const rows = await client.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT request_id FROM access_request_steps
       WHERE state = 'PENDING'::"AccessRequestStepState" AND assignee_employee_id = ANY(${[...employeeIds]}::uuid[])
       ORDER BY request_id`;

    return rows.map((row) => row.request_id);
  }

  /**
   * The requests whose need step is held and whose requester is one of these people, for internal software with no fee: the only
   * requests that follow the requester when they change department (`FR-3.16`, `QĐ-90b`, F28). A paid request keeps the department
   * it was sent from, and a service account does not follow the person who answers for it (`QĐ-86c`), so neither is here.
   */
  async needRequestIdsOfRequesters(employeeIds: readonly string[], client: DbTx = this.prisma): Promise<string[]> {
    if (employeeIds.length === 0) return [];
    const rows = await client.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT s.request_id FROM access_request_steps s JOIN access_requests r ON r.id = s.request_id
       WHERE s.kind = 'NEED'::"AccessRequestStepKind" AND s.state = 'PENDING'::"AccessRequestStepState"
         AND r.type <> 'SERVICE_ACCOUNT'::"AccessRequestType" AND r.branch = 'INTERNAL_FREE'::"AccessRequestBranch"
         AND r.requester_employee_id = ANY(${[...employeeIds]}::uuid[])
       ORDER BY s.request_id`;

    return rows.map((row) => row.request_id);
  }

  /**
   * The requests whose need step is held and that were sent for the department, whatever they are: a paid request, a proposal of new
   * software and a service account keep the department they were sent for, so a change of its head is a change for them by
   * `access_requests.department_id` and not by who sits in the department now (F28).
   */
  async needRequestIdsOfDepartment(departmentId: string, client: DbTx = this.prisma): Promise<string[]> {
    const rows = await client.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT s.request_id FROM access_request_steps s JOIN access_requests r ON r.id = s.request_id
       WHERE s.kind = 'NEED'::"AccessRequestStepKind" AND s.state = 'PENDING'::"AccessRequestStepState"
         AND r.department_id = ${departmentId}::uuid
       ORDER BY s.request_id`;

    return rows.map((row) => row.request_id);
  }

  /** The people who hold an open step: the ones to ask whether they still work. */
  async holderIds(client: DbTx | PrismaService = this.prisma): Promise<string[]> {
    const rows = await client.$queryRaw<{ assignee_employee_id: string }[]>`
      SELECT DISTINCT assignee_employee_id FROM access_request_steps
       WHERE state = 'PENDING'::"AccessRequestStepState" AND assignee_employee_id IS NOT NULL`;

    return rows.map((row) => row.assignee_employee_id);
  }

  /** The next requests, by id after `after`, whose need step is held: the pass of the day over every held need step. */
  async pendingNeedRequestIds(after: string | null, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ request_id: string }[]>`
      SELECT DISTINCT request_id FROM access_request_steps
       WHERE kind = 'NEED'::"AccessRequestStepKind" AND state = 'PENDING'::"AccessRequestStepState"
         AND (${after}::uuid IS NULL OR request_id > ${after}::uuid)
       ORDER BY request_id LIMIT ${limit}`;

    return rows.map((row) => row.request_id);
  }

  // --- the lock and the read ------------------------------------------------------------------------------

  /**
   * Locks the requests `FOR UPDATE` in the order of their ids, so two events at once queue behind each other and never
   * wait in a circle, then reads each one that still has an open step. A business transaction locks the request and then its
   * steps, which is the same direction.
   */
  async lockWithOpenSteps(tx: DbTx, requestIds: readonly string[]): Promise<ReassignableRequest[]> {
    const ids = [...new Set(requestIds)].sort();
    if (ids.length === 0) return [];
    await tx.$queryRaw`SELECT id FROM access_requests WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
    const rows = await tx.accessRequest.findMany({
      where: { id: { in: ids }, steps: { some: { state: { in: [...OPEN] } } } },
      orderBy: { id: 'asc' },
      select: SELECT_REQUEST,
    });

    return rows.map(toRequest);
  }

  // --- the write ------------------------------------------------------------------------------------------

  /** Gives the step to the person from now on. Its creation time, and so its deadline, stay as they were. */
  async assign(
    tx: DbTx,
    stepId: string,
    assigneeEmployeeId: string,
    routingRow: number | null,
    now: Date,
  ): Promise<void> {
    await tx.accessRequestStep.update({
      where: { id: stepId },
      data: {
        state: 'PENDING',
        assigneeEmployeeId,
        assignedAt: now,
        waitingReason: null,
        ...(routingRow === null ? {} : { routingRow }),
      },
    });
  }

  /** Takes the step from its holder and leaves it waiting, with the reason, for somebody valid. */
  async wait(tx: DbTx, stepId: string, reason: string): Promise<void> {
    await tx.accessRequestStep.update({
      where: { id: stepId },
      data: { state: 'WAITING', assigneeEmployeeId: null, assignedAt: null, waitingReason: reason },
    });
  }

  /**
   * Changes only the reason a waiting step waits for. The state stays `WAITING`, so the trigger on the step keeps `waiting_since`
   * (the stretch, and the alert it keyed), and `created_at` (the deadline) and `routing_row` are not touched.
   */
  async rewait(tx: DbTx, stepId: string, reason: string): Promise<void> {
    await tx.accessRequestStep.update({ where: { id: stepId }, data: { waitingReason: reason } });
  }

  /** When the step began its present stretch of waiting, as the database set it when the step went to WAITING. */
  async waitingSinceOf(tx: DbTx, stepId: string): Promise<Date | null> {
    const row = await tx.accessRequestStep.findUnique({ where: { id: stepId }, select: { waitingSince: true } });

    return row?.waitingSince ?? null;
  }

  /** The request follows the step that was given or made to wait; the caller holds its lock. */
  async setRequestState(tx: DbTx, requestId: string, state: string): Promise<void> {
    await tx.accessRequest.update({
      where: { id: requestId },
      data: { state: state as Prisma.AccessRequestUpdateInput['state'] },
    });
  }
}
