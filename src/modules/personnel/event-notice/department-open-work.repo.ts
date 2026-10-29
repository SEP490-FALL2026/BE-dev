import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { UseGroup, UseItem } from '../../organization/public/organization-use.types';

/**
 * The events of the personnel context that are not over for a department, told to the organization when it asks whether the
 * department may be retired (F15, `OPEN_WORK`): a transfer that still waits and leaves or enters it, a departure that is still being
 * handed over for a person of it, and a notice of a head (`BM-09`) not yet verified that it sent or that names it as the target. A
 * transfer that took effect or was cancelled, a departure that has left or was cancelled, and a notice that was recorded, rejected or
 * withdrawn are over. A long leave of a member is not told: the members already keep the department in use. Always six statements,
 * whatever the number of rows: the first `limit` of each kind and its exact count, in the caller's transaction when it gives one.
 */
@Injectable()
export class DepartmentOpenWorkRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** The first `limit` things that wait, ordered by (kind, id), and how many there are in all. */
  async read(departmentId: string, limit: number, tx?: DbTx): Promise<UseGroup> {
    const db = tx ?? this.prisma;
    const transfers: Prisma.DepartmentTransferWhereInput = {
      status: 'PENDING',
      OR: [{ fromDepartmentId: departmentId }, { toDepartmentId: departmentId }],
    };
    const cases: Prisma.OffboardingCaseWhereInput = { state: 'HANDING_OVER', departmentId };
    const notices: Prisma.PersonnelNoticeWhereInput = {
      status: 'PENDING_VERIFICATION',
      OR: [{ senderDepartmentId: departmentId }, { targetDepartmentId: departmentId }],
    };
    const first = { orderBy: { id: 'asc' }, take: limit } as const;
    const [transferRows, transferTotal, caseRows, caseTotal, noticeRows, noticeTotal] = await Promise.all([
      db.departmentTransfer.findMany({ where: transfers, select: { id: true }, ...first }),
      db.departmentTransfer.count({ where: transfers }),
      db.offboardingCase.findMany({ where: cases, select: { id: true }, ...first }),
      db.offboardingCase.count({ where: cases }),
      db.personnelNotice.findMany({ where: notices, select: { id: true, code: true }, ...first }),
      db.personnelNotice.count({ where: notices }),
    ]);
    const items: UseItem[] = [
      ...transferRows.map((row) => ({ kind: 'DEPARTMENT_TRANSFER', id: row.id, label: null })),
      ...caseRows.map((row) => ({ kind: 'OFFBOARDING_CASE', id: row.id, label: null })),
      ...noticeRows.map((row) => ({ kind: 'PERSONNEL_NOTICE', id: row.id, label: row.code })),
    ];

    return { items: items.slice(0, limit), total: transferTotal + caseTotal + noticeTotal };
  }
}
