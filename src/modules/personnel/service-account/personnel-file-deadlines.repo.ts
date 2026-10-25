import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  PendingFileQuery,
  PendingPersonnelFile,
  PersonnelFileKind,
} from '../../licensing/licensing-service-account.types';

interface Row {
  employee_id: string;
  due_on: string;
  file_kind: PersonnelFileKind;
  file_id: string;
}

/**
 * Reads which people have a personnel file that is not closed and the day it takes effect (`US-03-08`): a transfer that waits or has
 * taken effect and is not closed, and a departure that is not closed, whether a handover is under way or the person has left. The
 * day of a transfer is its `effective_on`; the day of a departure is the first day the person is no longer a member. A person with
 * more than one file is read once, by the earliest day. One statement whatever the number of people.
 */
@Injectable()
export class PersonnelFileDeadlinesRepo {
  constructor(private readonly prisma: PrismaService) {}

  async pending(query: PendingFileQuery, tx?: DbTx): Promise<PendingPersonnelFile[]> {
    if (query.employeeIds?.length === 0) return [];
    const people = query.employeeIds ? [...query.employeeIds] : null;
    const before = query.dueBefore ?? null;
    const rows = await (tx ?? this.prisma).$queryRaw<Row[]>`
      WITH files AS (
        SELECT t.employee_id, t.effective_on AS due_on, 'TRANSFER' AS file_kind, t.id AS file_id
          FROM department_transfers t
         WHERE t.status IN ('PENDING', 'EFFECTIVE') AND t.closed_at IS NULL
        UNION ALL
        SELECT o.employee_id, o.departure_effective_on, 'OFFBOARDING', o.id
          FROM offboarding_cases o
         WHERE o.state IN ('HANDING_OVER', 'LEFT') AND o.closed_at IS NULL
      ), earliest AS (
        SELECT DISTINCT ON (employee_id) employee_id, due_on, file_kind, file_id
          FROM files
         WHERE (${people}::uuid[] IS NULL OR employee_id = ANY(${people}::uuid[]))
         ORDER BY employee_id, due_on, file_kind
      )
      SELECT employee_id, to_char(due_on, 'YYYY-MM-DD') AS due_on, file_kind, file_id
        FROM earliest
       WHERE (${before}::date IS NULL OR due_on < ${before}::date)
       ORDER BY earliest.due_on, employee_id
       LIMIT ${query.limit}`;

    return rows.map((row) => ({
      employeeId: row.employee_id,
      fileKind: row.file_kind,
      fileId: row.file_id,
      dueOn: row.due_on,
    }));
  }
}
