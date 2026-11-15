import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { searchKey } from '../../../core/search-key';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { numberKeyOf, type ContractFields, type ContractStatus } from './contract-fields.policy';

export interface ContractRecord extends ContractFields {
  id: string;
  createdByAppUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractVendorBrief {
  id: string;
  name: string;
}

/** What the list shows of a contract: enough to know it, to filter it and to open it. */
export interface ContractSummaryRow {
  id: string;
  name: string;
  number: string | null;
  vendor: ContractVendorBrief | null;
  effectiveFrom: BusinessDate | null;
  effectiveTo: BusinessDate | null;
  subscriptionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One contract as the detail shows it, with its vendor by name. */
export interface ContractDetailRow extends ContractRecord {
  vendor: ContractVendorBrief | null;
  subscriptionCount: number;
}

export interface ContractListFilter {
  search?: string;
  vendorId?: string;
  status?: ContractStatus;
  /** Only the contracts in effect on this day. */
  effectiveOn?: BusinessDate;
  /** The day the status filter reads. */
  today: BusinessDate;
  /** The order of the beginning day; contracts with no beginning come last either way. */
  order: 'asc' | 'desc';
  skip: number;
  take: number;
}

const SUMMARY_SELECT = {
  id: true,
  name: true,
  number: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: { id: true, name: true } },
  _count: { select: { subscriptions: true } },
} satisfies Prisma.ContractSelect;

const DETAIL_SELECT = {
  id: true,
  name: true,
  vendorId: true,
  number: true,
  effectiveFrom: true,
  effectiveTo: true,
  note: true,
  createdByAppUserId: true,
  createdAt: true,
  updatedAt: true,
  vendor: { select: { id: true, name: true } },
  _count: { select: { subscriptions: true } },
} satisfies Prisma.ContractSelect;

type StoredFields = Pick<
  Prisma.ContractGetPayload<object>,
  'name' | 'vendorId' | 'number' | 'effectiveFrom' | 'effectiveTo' | 'note'
>;

const dayOrNull = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

const toRecord = (
  row: StoredFields & Pick<Prisma.ContractGetPayload<object>, 'id' | 'createdByAppUserId' | 'createdAt' | 'updatedAt'>,
): ContractRecord => ({
  id: row.id,
  name: row.name,
  vendorId: row.vendorId,
  number: row.number,
  effectiveFrom: dayOrNull(row.effectiveFrom),
  effectiveTo: dayOrNull(row.effectiveTo),
  note: row.note,
  createdByAppUserId: row.createdByAppUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The columns a set of fields is written to; the number is kept as written and as `searchKey` reads it. */
const columnsOf = (fields: ContractFields) => ({
  name: fields.name,
  vendorId: fields.vendorId,
  number: fields.number,
  numberKey: fields.number === null ? null : numberKeyOf(fields.number),
  effectiveFrom: fields.effectiveFrom === null ? null : toDateColumn(fields.effectiveFrom),
  effectiveTo: fields.effectiveTo === null ? null : toDateColumn(fields.effectiveTo),
  note: fields.note,
});

/** The contracts a status says, read against `today`; the same four cases as `contractStatusOf`. */
function statusWhere(status: ContractStatus, today: BusinessDate): Prisma.ContractWhereInput {
  const day = toDateColumn(today);
  switch (status) {
    case 'INCOMPLETE':
      return { OR: [{ vendorId: null }, { effectiveFrom: null }] };
    case 'NOT_YET_EFFECTIVE':
      return { vendorId: { not: null }, effectiveFrom: { gt: day } };
    case 'ACTIVE':
      return {
        vendorId: { not: null },
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
      };
    case 'EXPIRED':
      return { vendorId: { not: null }, effectiveFrom: { not: null }, effectiveTo: { lt: day } };
  }
}

function whereOf(filter: ContractListFilter): Prisma.ContractWhereInput {
  const all: Prisma.ContractWhereInput[] = [];
  const term = filter.search?.trim();
  if (term) {
    all.push({
      OR: [{ name: { contains: term, mode: 'insensitive' } }, { numberKey: { contains: searchKey(term) } }],
    });
  }
  if (filter.vendorId) all.push({ vendorId: filter.vendorId });
  if (filter.status) all.push(statusWhere(filter.status, filter.today));
  if (filter.effectiveOn) {
    const day = toDateColumn(filter.effectiveOn);
    all.push({ effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] });
  }

  return all.length === 0 ? {} : { AND: all };
}

/**
 * The one writer of `contracts` (`US-04-13`): made once, changed field by field under a lock (never its maker, place and time), never
 * deleted. A number that another contract has comes back as the unique violation of `number_key` for the service to name.
 */
@Injectable()
export class ContractRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: { organizationId: string; fields: ContractFields; createdByAppUserId: string },
  ): Promise<ContractRecord> {
    const row = await tx.contract.create({
      data: {
        organizationId: input.organizationId,
        createdByAppUserId: input.createdByAppUserId,
        ...columnsOf(input.fields),
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<ContractRecord | null> {
    const row = await (tx ?? this.prisma).contract.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The row locked `FOR UPDATE` for the rest of the transaction, so two writes on one contract queue; or null. */
  async lock(tx: DbTx, id: string): Promise<ContractRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM contracts WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** Writes the fields a change left the contract with. */
  async update(tx: DbTx, id: string, fields: ContractFields): Promise<ContractRecord> {
    return toRecord(await tx.contract.update({ where: { id }, data: columnsOf(fields) }));
  }

  /** The contract with its vendor by name, or null. */
  async findDetail(id: string): Promise<ContractDetailRow | null> {
    const row = await this.prisma.contract.findUnique({ where: { id }, select: DETAIL_SELECT });

    return row ? { ...toRecord(row), vendor: row.vendor, subscriptionCount: row._count.subscriptions } : null;
  }

  /** One page of contracts and the total, from one snapshot; the beginning day decides the order, then the name, then the id. */
  async list(filter: ContractListFilter): Promise<{ items: ContractSummaryRow[]; total: number }> {
    const where = whereOf(filter);

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.contract.findMany({
          where,
          select: SUMMARY_SELECT,
          orderBy: [{ effectiveFrom: { sort: filter.order, nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            number: row.number,
            vendor: row.vendor,
            effectiveFrom: dayOrNull(row.effectiveFrom),
            effectiveTo: dayOrNull(row.effectiveTo),
            subscriptionCount: row._count.subscriptions,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })),
          total: await tx.contract.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Whether another contract than `exceptId` has this number, read the way numbers are compared. */
  async numberTaken(tx: DbTx, organizationId: string, number: string, exceptId?: string): Promise<boolean> {
    const found = await tx.contract.findFirst({
      where: { organizationId, numberKey: numberKeyOf(number), ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });

    return found !== null;
  }
}
