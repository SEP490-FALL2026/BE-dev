import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReassignableStepKind } from './reassignment.policy';

/** An open step as the reassignment reads it, with what the table of its kind needs to run again. */
export interface ReassignableStep {
  id: string;
  kind: ReassignableStepKind;
  sequence: number;
  state: 'PENDING' | 'WAITING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CLOSED';
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
  /** Only the need step of a request for internal software with no fee follows where its requester is now (`FR-3.16`, F28). */
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

function toRequest(row: RequestRow): ReassignableRequest {
  const chain = (row.policy as { chain?: unknown } | null)?.chain;

  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    branch: row.branch,
    state: row.state,
    requesterEmployeeId: row.requesterEmployeeId,
    departmentId: row.departmentId,
    chainHasSpendStep: Array.isArray(chain) && chain.includes('SPEND_APPROVAL'),
    beneficiaryEmployeeIds: row.beneficiaries.map((beneficiary) => beneficiary.employeeId),
    lines: row.lines,
    steps: row.steps,
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

  /** When the step began its present stretch of waiting, as the database set it when the step went to WAITING. */
  async waitingSinceOf(tx: DbTx, stepId: string): Promise<Date | null> {
    const row = await tx.accessRequestStep.findUnique({ where: { id: stepId }, select: { waitingSince: true } });

    return row?.waitingSince ?? null;
  }

  /** Writes whether one person holds the need step and the spend step, on the steps whose flag changes. */
  async flagSamePerson(tx: DbTx, stepIds: readonly string[], same: boolean): Promise<void> {
    if (stepIds.length === 0) return;
    await tx.accessRequestStep.updateMany({ where: { id: { in: [...stepIds] } }, data: { samePersonAsSpend: same } });
  }

  /** The request follows the step that was given or made to wait; the caller holds its lock. */
  async setRequestState(tx: DbTx, requestId: string, state: string): Promise<void> {
    await tx.accessRequest.update({
      where: { id: requestId },
      data: { state: state as Prisma.AccessRequestUpdateInput['state'] },
    });
  }
}
