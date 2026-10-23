import { Injectable } from '@nestjs/common';
import { Prisma, type LicenseKeyStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A key of the vault as a list shows it: never the key itself, its fingerprint or its ciphertext. */
export interface LicenseKeyListed {
  id: string;
  subscriptionId: string;
  masked: string;
  status: LicenseKeyStatus;
  importedAt: Date;
}

/** What a reveal needs to open a key. */
export interface LicenseKeySealed {
  id: string;
  subscriptionId: string;
  cipherKeyId: string;
  ciphertext: Buffer;
}

export interface NewLicenseKey {
  id: string;
  organizationId: string;
  subscriptionId: string;
  fingerprint: string;
  masked: string;
  ciphertext: Buffer;
  cipherKeyId: string;
  importedByAppUserId: string;
}

/** The one writer of `license_keys`: a key is made once, never deleted, and only its status moves. */
@Injectable()
export class LicenseKeyRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keeps the key unless one with the same fingerprint is already in the organization's vault, and says which. The
   * database decides, so a key that two batches add at the same time is kept once: the second waits for the first.
   */
  async insertIfNew(tx: DbTx, key: NewLicenseKey): Promise<boolean> {
    const { count } = await tx.licenseKey.createMany({
      data: { ...key, ciphertext: new Uint8Array(key.ciphertext) },
      skipDuplicates: true,
    });

    return count === 1;
  }

  /** The keys of the purchase that can still be given out: in the store or assigned, not retired. */
  countUsable(subscriptionId: string, tx?: DbTx): Promise<number> {
    return (tx ?? this.prisma).licenseKey.count({
      where: { subscriptionId, status: { in: ['IN_STORE', 'ASSIGNED'] } },
    });
  }

  /** One page, the total for the filter and the keys still usable, all from one snapshot (`LD-11`): a key imported meanwhile is in none or in all. */
  async page(input: {
    subscriptionId: string;
    status?: LicenseKeyStatus;
    skip: number;
    take: number;
  }): Promise<{ items: LicenseKeyListed[]; total: number; usable: number }> {
    const where = { subscriptionId: input.subscriptionId, ...(input.status ? { status: input.status } : {}) };

    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.licenseKey.findMany({
          where,
          orderBy: [{ importedAt: 'asc' }, { id: 'asc' }],
          skip: input.skip,
          take: input.take,
          select: { id: true, subscriptionId: true, masked: true, status: true, importedAt: true },
        }),
        total: await tx.licenseKey.count({ where }),
        usable: await this.countUsable(input.subscriptionId, tx),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findSealed(tx: DbTx, id: string): Promise<LicenseKeySealed | null> {
    const row = await tx.licenseKey.findUnique({
      where: { id },
      select: { id: true, subscriptionId: true, cipherKeyId: true, ciphertext: true },
    });

    return row ? { ...row, ciphertext: Buffer.from(row.ciphertext) } : null;
  }
}
