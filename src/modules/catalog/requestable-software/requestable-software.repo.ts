import { Injectable } from '@nestjs/common';
import { searchKey } from '../../../core/search-key';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { REQUESTABLE_KINDS } from './requestable-software.policy';
import type {
  RequestableApplicationDetailRecord,
  RequestableApplicationFilter,
  RequestableApplicationRecord,
  RequestablePlanDetailRecord,
  RequestablePlanFilter,
  RequestablePlanRecord,
} from './requestable-software.types';

/**
 * What a person may ask for: an application still in the catalog, of a kind the request rules know, that has at least one
 * plan. A retired application, and every plan of it, is hidden.
 */
const OFFERED_APPLICATION: Prisma.ApplicationWhereInput = {
  catalogStatus: 'APPROVED',
  kind: { in: [...REQUESTABLE_KINDS] },
};

const APPLICATION_ROW = {
  id: true,
  name: true,
  kind: true,
  vendor: { select: { name: true } },
  functionalGroup: { select: { id: true, name: true } },
  _count: { select: { plans: true } },
} as const;
type ApplicationRow = Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_ROW }>;

const PLAN_ROW = {
  id: true,
  name: true,
  provisioningType: true,
  application: { select: { id: true, name: true, kind: true } },
} as const;
type PlanRow = Prisma.PlanGetPayload<{ select: typeof PLAN_ROW }>;

const toApplication = (row: ApplicationRow): RequestableApplicationRecord => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  vendorName: row.vendor?.name ?? null,
  functionalGroup: row.functionalGroup,
  planCount: row._count.plans,
});

const toPlan = (row: PlanRow): RequestablePlanRecord => ({
  id: row.id,
  name: row.name,
  provisioningType: row.provisioningType,
  application: row.application,
});

/**
 * The catalog as a person who asks for software reads it. It selects only what may be shown to them: no Business Owner, price,
 * subscription, contract, seat, key or workspace; the list reads the columns of a row and nothing a detail adds.
 */
@Injectable()
export class RequestableSoftwareRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of offered applications by name and the total for the same filter, from one snapshot. */
  listApplications(
    filter: RequestableApplicationFilter,
  ): Promise<{ items: RequestableApplicationRecord[]; total: number }> {
    const key = filter.search ? searchKey(filter.search) : '';
    const where: Prisma.ApplicationWhereInput = {
      AND: [
        OFFERED_APPLICATION,
        { plans: { some: {} } },
        ...(filter.kind ? [{ kind: filter.kind }] : []),
        ...(filter.functionalGroupId ? [{ functionalGroupId: filter.functionalGroupId }] : []),
        ...(key
          ? [{ OR: [{ normalizedName: { contains: key } }, { vendor: { is: { normalizedName: { contains: key } } } }] }]
          : []),
      ],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.application.findMany({
          where,
          select: APPLICATION_ROW,
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toApplication), total: await tx.application.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The offered application with this id, or null when it does not exist or is not offered. */
  async findApplication(id: string): Promise<RequestableApplicationDetailRecord | null> {
    const row = await this.prisma.application.findFirst({
      where: { id, AND: [OFFERED_APPLICATION, { plans: { some: {} } }] },
      select: { ...APPLICATION_ROW, dataSensitivity: true },
    });

    return row ? { ...toApplication(row), dataSensitivity: row.dataSensitivity } : null;
  }

  /** One page of the plans of offered applications, by application then plan name, and the total, from one snapshot. */
  listPlans(filter: RequestablePlanFilter): Promise<{ items: RequestablePlanRecord[]; total: number }> {
    const key = filter.search ? searchKey(filter.search) : '';
    const where: Prisma.PlanWhereInput = {
      AND: [
        { application: { is: OFFERED_APPLICATION } },
        ...(filter.kind ? [{ application: { is: { kind: filter.kind } } }] : []),
        ...(filter.applicationId ? [{ applicationId: filter.applicationId }] : []),
        ...(key
          ? [
              {
                OR: [
                  { normalizedName: { contains: key } },
                  { application: { is: { normalizedName: { contains: key } } } },
                ],
              },
            ]
          : []),
      ],
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.plan.findMany({
          where,
          select: PLAN_ROW,
          orderBy: [{ application: { normalizedName: 'asc' } }, { normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toPlan), total: await tx.plan.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The plan with this id when its application is offered, or null. */
  async findPlan(id: string): Promise<RequestablePlanDetailRecord | null> {
    const row = await this.prisma.plan.findFirst({
      where: { id, application: { is: OFFERED_APPLICATION } },
      select: {
        ...PLAN_ROW,
        sharingPolicy: true,
        dataLossOnRemoval: true,
        application: { select: { id: true, name: true, kind: true, vendor: { select: { name: true } } } },
      },
    });
    if (!row) return null;
    const { vendor, ...application } = row.application;

    return {
      ...toPlan({ ...row, application }),
      vendorName: vendor?.name ?? null,
      sharingPolicy: row.sharingPolicy,
      dataLossOnRemoval: row.dataLossOnRemoval,
    };
  }
}
