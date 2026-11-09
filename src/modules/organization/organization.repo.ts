import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import { OrganizationAlreadyExistsError } from './public/organization.errors';
import { CreateOrganizationInput, OrganizationRecord } from './public/organization.types';

const ORGANIZATION_SELECT = { id: true, name: true, timeZone: true, reportingCurrency: true } as const;

/** The one writer of `organizations`: the installation's single organization (`FR-9.8`, I-8). */
@Injectable()
export class OrganizationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findOrganization(tx?: DbTx): Promise<OrganizationRecord | null> {
    return (tx ?? this.prisma).organization.findFirst({ select: ORGANIZATION_SELECT });
  }

  /**
   * The organization with its row held `FOR SHARE` until the transaction ends. A change of the reporting currency waits
   * for the holder, and a reader that comes after a change waits for it and reads the new currency: whatever the caller
   * then freezes into that currency cannot meet a change that commits meanwhile (DB-01, the database triggers say the same).
   */
  async findOrganizationShared(tx: DbTx): Promise<OrganizationRecord | null> {
    await tx.$queryRaw`SELECT "id" FROM "organizations" FOR SHARE`;

    return tx.organization.findFirst({ select: ORGANIZATION_SELECT });
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
