import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { Prisma } from '../../../generated/prisma/client';
import { ProjectRecord, ProjectStatus, ProjectSummaryRecord } from './project.types';

const DEPARTMENT_REF = { id: true, code: true, name: true } as const;
const sortedDepartments = (links: { department: { id: string; code: string; name: string } }[]) =>
  links.map((link) => link.department).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

/**
 * Projects described on department profiles and the departments that take part (`US-03-06` AC-14). It also checks
 * that the departments a project names exist: an input invariant of the project, read in the same transaction.
 */
@Injectable()
export class ProjectRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertProject(
    tx: DbTx,
    input: {
      organizationId: string;
      name: string;
      description: string | null;
      status: ProjectStatus;
      departmentIds: string[];
    },
  ): Promise<string> {
    const created = await tx.project.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        status: input.status,
        departments: { create: input.departmentIds.map((departmentId) => ({ departmentId })) },
      },
      select: { id: true },
    });

    return created.id;
  }

  async lockProject(tx: DbTx, id: string): Promise<ProjectRecord | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM projects WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) return null;

    return this.findProject(id, tx);
  }

  async findProject(id: string, tx?: DbTx): Promise<ProjectRecord | null> {
    const row = await (tx ?? this.prisma).project.findUnique({
      where: { id },
      include: { departments: { include: { department: { select: { id: true, code: true, name: true } } } } },
    });

    return row ? this.toProject(row) : null;
  }

  async updateProject(
    tx: DbTx,
    id: string,
    data: { name?: string; description?: string | null; status?: ProjectStatus; departmentIds?: string[] },
    now: Date,
  ): Promise<void> {
    const { departmentIds, ...fields } = data;
    await tx.project.update({ where: { id }, data: { ...fields, updatedAt: now } });
    if (departmentIds) {
      await tx.projectDepartment.deleteMany({ where: { projectId: id } });
      await tx.projectDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ projectId: id, departmentId })),
      });
    }
  }

  /** One page of projects by name then id, and the total for the same filter, from one snapshot (`LD-12`). */
  async page(
    departmentId: string | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: ProjectSummaryRecord[]; total: number }> {
    const where = departmentId ? { departments: { some: { departmentId } } } : {};

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.project.findMany({
          where,
          select: {
            id: true,
            name: true,
            status: true,
            updatedAt: true,
            departments: { select: { department: { select: DEPARTMENT_REF } } },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip,
          take,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            updatedAt: row.updatedAt,
            departments: sortedDepartments(row.departments),
          })),
          total: await tx.project.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The first `take` projects a department takes part in, in full, and how many there are, from one snapshot. */
  async forDepartment(departmentId: string, take: number): Promise<{ items: ProjectRecord[]; total: number }> {
    const where = { departments: { some: { departmentId } } };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.project.findMany({
          where,
          include: { departments: { include: { department: { select: DEPARTMENT_REF } } } },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          take,
        });

        return { items: rows.map((row) => this.toProject(row)), total: await tx.project.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async existingDepartmentIds(tx: DbTx, ids: string[]): Promise<Set<string>> {
    const rows = await tx.department.findMany({ where: { id: { in: ids } }, select: { id: true } });

    return new Set(rows.map((row) => row.id));
  }

  private toProject(row: {
    id: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: Date;
    updatedAt: Date;
    departments: { department: { id: string; code: string; name: string } }[];
  }): ProjectRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      departments: sortedDepartments(row.departments),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
