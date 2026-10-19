import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ProjectRecord, ProjectStatus } from './project.types';

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

  async listProjects(departmentId: string | undefined, client?: DbTx): Promise<ProjectRecord[]> {
    const rows = await (client ?? this.prisma).project.findMany({
      where: departmentId ? { departments: { some: { departmentId } } } : {},
      include: { departments: { include: { department: { select: { id: true, code: true, name: true } } } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => this.toProject(row));
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
      departments: row.departments
        .map((link) => link.department)
        .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
