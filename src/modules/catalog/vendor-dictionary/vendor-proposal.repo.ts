import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { VendorProposalListFilter, VendorProposalRecord, VendorProposalStatus } from './vendor-dictionary.types';

type ProposalRow = Prisma.VendorDictionaryProposalGetPayload<object>;

const toRecord = (row: ProposalRow): VendorProposalRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.proposedName,
  status: row.status,
  serviceLineId: row.resolvedLineId,
  createdAt: row.createdAt,
  resolvedAt: row.resolvedAt,
});

/** The one writer of `vendor_dictionary_proposals`: a vendor an application declaration did not find in the dictionary. */
@Injectable()
export class VendorProposalRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One page, oldest first, and the total for the same filter, from one snapshot. */
  async list(filter: VendorProposalListFilter): Promise<{ items: VendorProposalRecord[]; total: number }> {
    const where: Prisma.VendorDictionaryProposalWhereInput = filter.status ? { status: filter.status } : {};

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.vendorDictionaryProposal.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.vendorDictionaryProposal.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Raises a proposal from an application declaration unless the organization already has an open one for the same
   * name (the partial unique index decides, so two declarations at once raise one). True when this call made it.
   */
  async raise(
    tx: DbTx,
    input: {
      organizationId: string;
      name: string;
      normalizedName: string;
      domains: string[];
      sourceApplicationId: string;
    },
  ): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO vendor_dictionary_proposals
        (id, organization_id, proposed_name, normalized_name, proposed_domains, source_application_id)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.name}, ${input.normalizedName},
              ${input.domains}::text[], ${input.sourceApplicationId}::uuid)
      ON CONFLICT (organization_id, normalized_name) WHERE status = 'PENDING' DO NOTHING
      RETURNING id`;

    return rows.length > 0;
  }

  /** The proposal, locked until the transaction ends, so two resolutions of it cannot both see it pending. */
  async lock(tx: DbTx, id: string): Promise<VendorProposalRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM vendor_dictionary_proposals WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.vendorDictionaryProposal.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  async resolve(
    tx: DbTx,
    id: string,
    outcome: Exclude<VendorProposalStatus, 'PENDING'>,
    serviceLineId: string | null,
  ): Promise<VendorProposalRecord> {
    const row = await tx.vendorDictionaryProposal.update({
      where: { id },
      data: { status: outcome, resolvedLineId: serviceLineId, resolvedAt: new Date() },
    });

    return toRecord(row);
  }
}
