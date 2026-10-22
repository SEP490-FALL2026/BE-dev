import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import { OrganizationAlreadyExistsError } from './organization.errors';
import { CreateOrganizationInput, OrganizationRecord } from './organization.types';

const ORGANIZATION_SELECT = { id: true, name: true, timeZone: true, reportingCurrency: true } as const;

/** The one writer of `organizations`: the installation's single organization (`FR-9.8`, I-8). */
@Injectable()
export class OrganizationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return (tx ?? this.prisma).organization.findFirst({ select: ORGANIZATION_SELECT });
  }

  /** Writes the reporting currency; the database refuses (55000) once rates or converted prices exist. */
  async setReportingCurrency(tx: DbTx, organizationId: string, currency: string): Promise<void> {
    await tx.organization.update({ where: { id: organizationId }, data: { reportingCurrency: currency } });
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
}
