import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RoleFlag } from '../personnel.types';

/** What the flows of the roles read of a case of a person who leaves. */
export interface RoleDutyCase {
  id: string;
  employeeId: string;
  state: 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
  lastWorkingDay: BusinessDate;
  /** The person headed the department they leave; who follows them: an employee, nobody, or null when they did not head it. */
  headSuccessor: 'EMPLOYEE' | 'NONE' | null;
  departmentId: string;
  closed: boolean;
  roleFlags: RoleFlag[];
}

const SELECT = {
  id: true,
  employeeId: true,
  state: true,
  lastWorkingDay: true,
  headHandover: true,
  departmentId: true,
  closedAt: true,
  roleFlags: true,
} as const;

/**
 * The reader of the case for the roles of the person who leaves, and the only writer of its `role_flags` snapshot (`US-03-04` AC-11,
 * AC-12): the column decides nothing and stops nothing, the writer of the case never touches it, and a trigger lets it change while the
 * case lives. The head of the department is told by the case itself (what the handover of the head moved), not by a read of the organization.
 */
@Injectable()
export class RoleDutiesRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One case by id, in the caller's transaction (the hooks run in the transaction that wrote it); null when there is none. */
  async findCase(id: string, tx: DbTx): Promise<RoleDutyCase | null> {
    const row = await tx.offboardingCase.findUnique({ where: { id }, select: SELECT });

    return row && this.toCase(row);
  }

  /** The live case of the person that is not closed (a handover or a departure), or null: what they see of their own departure. */
  async findOpenOf(employeeId: string, tx?: DbTx): Promise<RoleDutyCase | null> {
    const row = await (tx ?? this.prisma).offboardingCase.findFirst({
      where: { employeeId, state: { in: ['HANDING_OVER', 'LEFT'] }, closedAt: null },
      select: SELECT,
    });

    return row && this.toCase(row);
  }

  /** Writes the snapshot of the flags the person held when the case was written or its day moved. */
  async writeFlags(id: string, flags: readonly RoleFlag[], tx: DbTx): Promise<void> {
    await tx.offboardingCase.update({ where: { id }, data: { roleFlags: [...flags] }, select: { id: true } });
  }

  private toCase(row: {
    id: string;
    employeeId: string;
    state: 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
    lastWorkingDay: Date;
    headHandover: unknown;
    departmentId: string;
    closedAt: Date | null;
    roleFlags: RoleFlag[];
  }): RoleDutyCase {
    const handover = row.headHandover as { successor?: 'EMPLOYEE' | 'NONE' } | null;

    return {
      id: row.id,
      employeeId: row.employeeId,
      state: row.state,
      lastWorkingDay: fromDateColumn(row.lastWorkingDay),
      headSuccessor: handover?.successor ?? null,
      departmentId: row.departmentId,
      closed: row.closedAt !== null,
      roleFlags: row.roleFlags,
    };
  }
}
