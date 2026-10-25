import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { TimingFacts } from './request-timing.policy';

/** What the time of a request is measured from, with who may see the request. */
export interface TimingSource {
  facts: TimingFacts;
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: string[];
  needStepAssigneeEmployeeId: string | null;
}

/** Reads the moments a request already keeps, in one query: the request, its steps and the batches that held it. Reads only. */
@Injectable()
export class RequestTimingRepo {
  constructor(private readonly prisma: PrismaService) {}

  async sourceOf(requestId: string): Promise<TimingSource | null> {
    const row = await this.prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: {
        state: true,
        submittedAt: true,
        grantCompletedAt: true,
        requesterEmployeeId: true,
        beneficiaries: { select: { employeeId: true } },
        steps: {
          orderBy: { sequence: 'asc' },
          select: { kind: true, state: true, createdAt: true, decidedAt: true, assigneeEmployeeId: true },
        },
        // A batch that stopped the request in the queue did not send it on.
        batchItems: { where: { outcome: { not: 'STOPPED' } }, select: { batch: { select: { submittedAt: true } } } },
      },
    });
    if (!row) return null;
    const sentAt = row.batchItems.map((item) => item.batch.submittedAt.getTime());

    return {
      requesterEmployeeId: row.requesterEmployeeId,
      beneficiaryEmployeeIds: row.beneficiaries.map((beneficiary) => beneficiary.employeeId),
      needStepAssigneeEmployeeId: row.steps.find((step) => step.kind === 'NEED')?.assigneeEmployeeId ?? null,
      facts: {
        requestState: row.state,
        submittedAt: row.submittedAt,
        grantCompletedAt: row.grantCompletedAt,
        steps: row.steps.map((step) => ({
          kind: step.kind,
          state: step.state,
          createdAt: step.createdAt,
          decidedAt: step.decidedAt,
        })),
        queueSentAt: sentAt.length === 0 ? null : new Date(Math.max(...sentAt)),
      },
    };
  }
}
