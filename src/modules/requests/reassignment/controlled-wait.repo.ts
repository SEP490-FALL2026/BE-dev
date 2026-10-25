import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReassignableStepKind } from './reassignment.policy';

export interface NewControlledWaitAlert {
  organizationId: string;
  requestId: string;
  stepId: string;
  stepKind: ReassignableStepKind;
  waitingReason: string;
  waitingSince: Date;
}

/** A step that waits under control, with what the queue of the people who put it right shows. */
export interface WaitingStepRow {
  stepId: string;
  requestId: string;
  stepKind: ReassignableStepKind;
  waitingReason: string;
  waitingSince: Date;
  requesterEmployeeId: string;
  departmentId: string;
  /** When the people who can put it right were told of this stretch of waiting; null before the pass that tells them. */
  alertedAt: Date | null;
}

/**
 * The one writer of `controlled_wait_alerts`, and the read of the steps that wait under control. The queue is the steps
 * themselves (`state = WAITING`); the table keeps the one alert of each stretch of waiting and when it was raised.
 */
@Injectable()
export class ControlledWaitRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Records the alert of this stretch of waiting; false when it was already raised, which is what makes it one per stretch. */
  async insertAlert(tx: DbTx, alert: NewControlledWaitAlert): Promise<boolean> {
    const { count } = await tx.controlledWaitAlert.createMany({ data: [alert], skipDuplicates: true });

    return count === 1;
  }

  /**
   * One page of the steps that wait, the longest waiting first, and the total, from one snapshot. `departmentIds` limits the
   * requests to those sent for these departments; `null` is every department.
   */
  async page(
    departmentIds: readonly string[] | null,
    skip: number,
    take: number,
  ): Promise<{ rows: WaitingStepRow[]; total: number }> {
    const where: Prisma.AccessRequestStepWhereInput = {
      state: 'WAITING',
      ...(departmentIds === null ? {} : { request: { departmentId: { in: [...departmentIds] } } }),
    };
    const { steps, total } = await this.prisma.$transaction(
      async (tx) => ({
        steps: await tx.accessRequestStep.findMany({
          where,
          orderBy: [{ waitingSince: 'asc' }, { id: 'asc' }],
          skip,
          take,
          select: {
            id: true,
            requestId: true,
            kind: true,
            waitingReason: true,
            waitingSince: true,
            request: { select: { requesterEmployeeId: true, departmentId: true } },
          },
        }),
        total: await tx.accessRequestStep.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const alerts =
      steps.length === 0
        ? []
        : await this.prisma.controlledWaitAlert.findMany({
            where: {
              OR: steps.flatMap((step) =>
                step.waitingSince === null ? [] : [{ stepId: step.id, waitingSince: step.waitingSince }],
              ),
            },
            select: { stepId: true, waitingSince: true, createdAt: true },
          });
    const raisedAt = new Map(
      alerts.map((alert) => [`${alert.stepId}@${alert.waitingSince.getTime()}`, alert.createdAt]),
    );

    return {
      total,
      rows: steps.flatMap((step) =>
        step.waitingSince === null || step.waitingReason === null
          ? []
          : [
              {
                stepId: step.id,
                requestId: step.requestId,
                stepKind: step.kind,
                waitingReason: step.waitingReason,
                waitingSince: step.waitingSince,
                requesterEmployeeId: step.request.requesterEmployeeId,
                departmentId: step.request.departmentId,
                alertedAt: raisedAt.get(`${step.id}@${step.waitingSince.getTime()}`) ?? null,
              },
            ],
      ),
    };
  }
}
