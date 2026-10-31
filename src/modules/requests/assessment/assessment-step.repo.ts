import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { NeedStepState } from '../access-request/access-request.types';

/** The step of the IT Admin who assesses the software of a proposal (`US-05-06`). It follows the need step. */
export interface AssessmentStepRecord {
  id: string;
  state: NeedStepState;
  assigneeEmployeeId: string | null;
  /** Why nobody holds it: no IT Admin in charge of the department of the sender who still works. */
  waitingReason: string | null;
  slaWorkingDays: number;
  createdAt: Date;
  assignedAt: Date | null;
  decidedAt: Date | null;
}

/** The step comes after the need step, which is the first. */
const ASSESSMENT_SEQUENCE = 2;
/** The row of the routing table that gave the step: none, the organization names the IT Admin in charge (`US-01-11`). */
const NOT_ROUTED = 9;
export const NO_IT_ADMIN_IN_CHARGE = 'NO_IT_ADMIN_IN_CHARGE';

const SELECT_STEP = {
  id: true,
  state: true,
  assigneeEmployeeId: true,
  waitingReason: true,
  slaWorkingDays: true,
  createdAt: true,
  assignedAt: true,
  decidedAt: true,
} as const;

/** Writes and reads the IT assessment step of `access_request_steps`, which the request repo does not know. */
@Injectable()
export class AssessmentStepRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Gives the step to the IT Admin in charge, or leaves it waiting for one when there is none who still works. */
  async add(
    tx: DbTx,
    input: { requestId: string; assigneeEmployeeId: string | null; slaWorkingDays: number; now: Date },
  ): Promise<void> {
    const held = input.assigneeEmployeeId !== null;
    await tx.accessRequestStep.create({
      data: {
        requestId: input.requestId,
        kind: 'IT_ASSESSMENT',
        sequence: ASSESSMENT_SEQUENCE,
        state: held ? 'PENDING' : 'WAITING',
        assigneeEmployeeId: input.assigneeEmployeeId,
        routingRow: NOT_ROUTED,
        waitingReason: held ? null : NO_IT_ADMIN_IN_CHARGE,
        slaWorkingDays: input.slaWorkingDays,
        createdAt: input.now,
        assignedAt: held ? input.now : null,
      },
    });
  }

  async find(requestId: string, tx?: DbTx): Promise<AssessmentStepRecord | null> {
    const row = await (tx ?? this.prisma).accessRequestStep.findFirst({
      where: { requestId, kind: 'IT_ASSESSMENT' },
      select: SELECT_STEP,
    });

    // An assessment step is only ever held, waiting, approved or refused.
    return row && { ...row, state: row.state as NeedStepState };
  }

  /** Ends the step: approved by completing the assessment, or refused at the gate (`US-05-18`). A step nobody held is taken by the person who ends it. */
  async finish(
    tx: DbTx,
    stepId: string,
    employeeId: string,
    now: Date,
    outcome: 'APPROVED' | 'REJECTED' = 'APPROVED',
  ): Promise<void> {
    const step = await tx.accessRequestStep.findUniqueOrThrow({
      where: { id: stepId },
      select: { assigneeEmployeeId: true },
    });
    await tx.accessRequestStep.update({
      where: { id: stepId },
      data: {
        state: outcome,
        decidedAt: now,
        waitingReason: null,
        assigneeEmployeeId: step.assigneeEmployeeId ?? employeeId,
        ...(step.assigneeEmployeeId === null ? { assignedAt: now } : {}),
      },
    });
  }
}
