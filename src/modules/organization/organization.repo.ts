import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import { OrganizationAlreadyExistsError } from './errors/organization.errors';
import { CreateDepartmentInput, CreateOrganizationInput, OrganizationRecord } from './organization.types';

const ORGANIZATION_SELECT = { id: true, name: true, timeZone: true, reportingCurrency: true } as const;

@Injectable()
export class OrganizationRepo {
  constructor(private readonly prisma: PrismaService) {}

  // --- installation -----------------------------------------------------------------

  async findOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return (tx ?? this.prisma).organization.findFirst({ select: ORGANIZATION_SELECT });
  }

  async createOrganization(tx: DbTx, input: CreateOrganizationInput): Promise<OrganizationRecord> {
    try {
      return await tx.organization.create({
        data: { ...input, bootstrapCompletedAt: new Date() },
        select: ORGANIZATION_SELECT,
      });
    } catch (error) {
      // The singleton index is the last defence when two installers race past the advisory lock.
      if (isUniqueViolation(error, 'organizations_singleton')) throw new OrganizationAlreadyExistsError();
      throw error;
    }
  }

  async createDepartment(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return tx.department.create({ data: input, select: { id: true } });
  }

  // --- departments (department persistence until Wave 3 moves it to department/) ------

  /**
   * Takes the department's row lock (`FOR SHARE`: it must still exist, and its cost center must not change, until
   * commit) and reads it. Null when there is no department with this code.
   */
  async lockDepartmentByCode(
    tx: DbTx,
    organizationId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string; active: boolean; costCenterActive: boolean } | null> {
    const rows = await tx.$queryRaw<
      { id: string; code: string; name: string; cost_center_id: string; status: string }[]
    >`
      SELECT id, code, name, cost_center_id, status::text AS status FROM departments
       WHERE organization_id = ${organizationId}::uuid AND code = ${code} FOR SHARE`;
    const department = rows[0];
    if (!department) return null;

    // Read after the lock, in a statement of its own (lock protocol rule 7): a retirement of the cost center that
    // committed while this waited for the department is seen here.
    const centers = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM cost_centers WHERE id = ${department.cost_center_id}::uuid`;

    return {
      id: department.id,
      code: department.code,
      name: department.name,
      active: department.status === 'ACTIVE',
      costCenterActive: centers[0]?.status === 'ACTIVE',
    };
  }
}
