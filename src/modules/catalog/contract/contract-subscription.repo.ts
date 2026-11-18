import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** A subscription of a contract as the contract shows it: what it is, of which plan and application, and since when it is linked. */
export interface ContractSubscriptionBrief {
  subscriptionId: string;
  status: 'DRAFT' | 'ACTIVE';
  kind: 'TERM' | 'PERPETUAL';
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  planId: string;
  planName: string;
  provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  applicationId: string;
  applicationName: string;
  logoUrl: string | null;
  linkedAt: Date;
}

/** What a link of a subscription needs to be judged: its plan, the vendor of its application, and the contract it rests on now. */
export interface SubscriptionLinkFacts {
  subscriptionId: string;
  provisioningType: string;
  vendorId: string | null;
  contractId: string | null;
}

const BRIEF_SELECT = {
  id: true,
  status: true,
  kind: true,
  startDate: true,
  endDate: true,
  plan: {
    select: {
      id: true,
      name: true,
      provisioningType: true,
      application: { select: { id: true, name: true, logoUrl: true } },
    },
  },
} satisfies Prisma.SubscriptionSelect;

type BriefSubscription = Prisma.SubscriptionGetPayload<{ select: typeof BRIEF_SELECT }>;

const toBrief = (subscription: BriefSubscription, linkedAt: Date): ContractSubscriptionBrief => ({
  subscriptionId: subscription.id,
  status: subscription.status,
  kind: subscription.kind,
  startDate: subscription.startDate ? fromDateColumn(subscription.startDate) : null,
  endDate: subscription.endDate ? fromDateColumn(subscription.endDate) : null,
  planId: subscription.plan.id,
  planName: subscription.plan.name,
  provisioningType: subscription.plan.provisioningType,
  applicationId: subscription.plan.application.id,
  applicationName: subscription.plan.application.name,
  logoUrl: subscription.plan.application.logoUrl,
  linkedAt,
});

/**
 * The one writer of `contract_subscriptions` (`QĐ-111t`): which contract a subscription rests on. A link is made and unmade, never
 * changed; the plan and the vendor are read from the subscription, which this repo never writes.
 */
@Injectable()
export class ContractSubscriptionRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** What the link of one subscription is judged by, or null when there is no such subscription. */
  async linkFacts(subscriptionId: string, tx?: DbTx): Promise<SubscriptionLinkFacts | null> {
    const row = await (tx ?? this.prisma).subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        plan: { select: { provisioningType: true, application: { select: { vendorId: true } } } },
        contractLink: { select: { contractId: true } },
      },
    });

    return row
      ? {
          subscriptionId: row.id,
          provisioningType: row.plan.provisioningType,
          vendorId: row.plan.application.vendorId,
          contractId: row.contractLink?.contractId ?? null,
        }
      : null;
  }

  /** The contract a subscription rests on, or null. */
  async currentContractOf(subscriptionId: string): Promise<string | null> {
    const row = await this.prisma.contractSubscription.findUnique({
      where: { subscriptionId },
      select: { contractId: true },
    });

    return row?.contractId ?? null;
  }

  async insert(
    tx: DbTx,
    input: { contractId: string; subscriptionId: string; linkedByAppUserId: string },
  ): Promise<Date> {
    const row = await tx.contractSubscription.create({ data: input, select: { linkedAt: true } });

    return row.linkedAt;
  }

  /** Removes the link and says whether there was one. */
  async remove(tx: DbTx, contractId: string, subscriptionId: string): Promise<boolean> {
    const removed = await tx.contractSubscription.deleteMany({ where: { contractId, subscriptionId } });

    return removed.count > 0;
  }

  async countOf(tx: DbTx, contractId: string): Promise<number> {
    return tx.contractSubscription.count({ where: { contractId } });
  }

  /** One subscription of a contract as the contract shows it, or null when it is not linked to it. */
  async briefOf(contractId: string, subscriptionId: string, tx?: DbTx): Promise<ContractSubscriptionBrief | null> {
    const row = await (tx ?? this.prisma).contractSubscription.findUnique({
      where: { subscriptionId },
      select: { contractId: true, linkedAt: true, subscription: { select: BRIEF_SELECT } },
    });

    return row && row.contractId === contractId ? toBrief(row.subscription, row.linkedAt) : null;
  }

  /** The subscriptions of a contract, the last linked first, at most `limit`. */
  async briefsOf(contractId: string, limit: number): Promise<ContractSubscriptionBrief[]> {
    const rows = await this.prisma.contractSubscription.findMany({
      where: { contractId },
      select: { linkedAt: true, subscription: { select: BRIEF_SELECT } },
      orderBy: [{ linkedAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map((row) => toBrief(row.subscription, row.linkedAt));
  }

  /** The applications of the subscriptions of a contract, each once, by id, at most `limit`. */
  async applicationIdsOf(contractId: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ application_id: string }[]>`
      SELECT DISTINCT p.application_id
        FROM contract_subscriptions cs
        JOIN subscriptions s ON s.id = cs.subscription_id
        JOIN plans p ON p.id = s.plan_id
       WHERE cs.contract_id = ${contractId}::uuid
       ORDER BY p.application_id
       LIMIT ${limit}`;

    return rows.map((row) => row.application_id);
  }
}
