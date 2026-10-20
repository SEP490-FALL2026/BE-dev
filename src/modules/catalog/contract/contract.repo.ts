import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface ContractRecord {
  id: string;
  name: string;
  createdByAppUserId: string;
  createdAt: Date;
}

/** The one writer of `contracts`: a record that is made once and never changed or deleted. */
@Injectable()
export class ContractRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: { organizationId: string; name: string; createdByAppUserId: string },
  ): Promise<ContractRecord> {
    const row = await tx.contract.create({ data: input });

    return { id: row.id, name: row.name, createdByAppUserId: row.createdByAppUserId, createdAt: row.createdAt };
  }

  async find(id: string, tx?: DbTx): Promise<ContractRecord | null> {
    const row = await (tx ?? this.prisma).contract.findUnique({ where: { id } });

    return row
      ? { id: row.id, name: row.name, createdByAppUserId: row.createdByAppUserId, createdAt: row.createdAt }
      : null;
  }
}
