import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { offboardingChangeDetailJson, type ChangeDetail } from '../personnel-change-detail.json';
import type { HandoverItem, HandoverSource } from './it-handover.types';

const whereSource = (source: HandoverSource) =>
  source.kind === 'OFFBOARDING_CASE' ? { offboardingCaseId: source.id } : { departmentTransferId: source.id };

type ItemRow = {
  id: string;
  organizationId: string;
  subscriptionsAtRecord: number;
  applicationsAtRecord: number;
  doneAt: Date | null;
  doneToEmployeeId: string | null;
  doneSubscriptions: number | null;
  doneApplications: number | null;
};

const toItem = (row: ItemRow): HandoverItem => ({
  id: row.id,
  organizationId: row.organizationId,
  subscriptionsAtRecord: row.subscriptionsAtRecord,
  applicationsAtRecord: row.applicationsAtRecord,
  done:
    row.doneAt !== null &&
    row.doneToEmployeeId !== null &&
    row.doneSubscriptions !== null &&
    row.doneApplications !== null
      ? {
          at: row.doneAt,
          toEmployeeId: row.doneToEmployeeId,
          subscriptions: row.doneSubscriptions,
          applications: row.doneApplications,
        }
      : null,
});

/**
 * The reads and writes of the hand-over of an IT Admin who leaves (`QĐ-110j`, X-IT.3) on `it_admin_handovers`, and the line it adds to the log
 * of a departure. The file the hand-over hangs on is read by `ItHandoverSourceRepo`.
 */
@Injectable()
export class ItHandoverRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findItem(source: HandoverSource, tx?: DbTx): Promise<HandoverItem | null> {
    const row = await (tx ?? this.prisma).itAdminHandover.findUnique({ where: whereSource(source) });

    return row && toItem(row);
  }

  /** Keeps what the person answered for when the file was recorded; a second call for the same file writes nothing. */
  async insertItem(
    tx: DbTx,
    input: { organizationId: string; source: HandoverSource; subscriptions: number; applications: number },
  ): Promise<void> {
    await tx.itAdminHandover.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: input.organizationId,
          ...whereSource(input.source),
          subscriptionsAtRecord: input.subscriptions,
          applicationsAtRecord: input.applications,
        },
      ],
      skipDuplicates: true,
    });
  }

  /**
   * Writes the hand-over: the latest one is the one kept (the person may answer for something new after an earlier hand-over). A file for a
   * person who answered for nothing when it was recorded gets its row now, with what was moved as what they answered for.
   */
  async recordDone(
    tx: DbTx,
    input: {
      organizationId: string;
      source: HandoverSource;
      done: { at: Date; toEmployeeId: string; subscriptions: number; applications: number };
    },
  ): Promise<void> {
    const { done } = input;
    const columns = {
      doneAt: done.at,
      doneToEmployeeId: done.toEmployeeId,
      doneSubscriptions: done.subscriptions,
      doneApplications: done.applications,
    };
    await tx.itAdminHandover.upsert({
      where: whereSource(input.source),
      create: {
        id: randomUUID(),
        organizationId: input.organizationId,
        ...whereSource(input.source),
        subscriptionsAtRecord: done.subscriptions,
        applicationsAtRecord: done.applications,
        ...columns,
      },
      update: columns,
    });
  }

  /** The line in the log of a departure that says the hand-over was done (kind `IT_ADMIN_HANDED_OVER`); the log of a transfer has no such kind. */
  async insertCaseChange(
    tx: DbTx,
    input: { caseId: string; detail: ChangeDetail; changedByAppUserId: string },
  ): Promise<void> {
    await tx.offboardingCaseChange.create({
      data: {
        id: randomUUID(),
        caseId: input.caseId,
        kind: 'IT_ADMIN_HANDED_OVER',
        detail: offboardingChangeDetailJson.encode(input.detail),
        changedByAppUserId: input.changedByAppUserId,
        changedByTicketId: null,
      },
    });
  }
}
