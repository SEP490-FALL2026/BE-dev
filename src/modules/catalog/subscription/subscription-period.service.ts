import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SubscriptionPeriodRefusedError } from '../public/subscription-period.errors';
import type { NextPeriodInput, RenewalPeriodFacts } from '../public/subscription-period.types';
import { assertPoolTerms } from './pool/subscription-pool.policy';
import { SubscriptionPoolService } from './pool/subscription-pool.service';
import { snapshotOf } from './subscription.mapper';
import {
  assertSubscriptionShape,
  declaredStateOf,
  deriveNotice,
  noticeInputOf,
  subscriptionStatusOf,
} from './subscription.policy';
import { SubscriptionRepo } from './subscription.repo';
import { SubscriptionPricingService } from './subscription-pricing.service';
import type { ApplicationKind, BillingCycle, ProvisioningType, SubscriptionRecord } from './subscription.types';

/** How many periods one pass of the renewal sweep reads at most; the next pass takes the rest. */
const SWEEP_LIMIT = 500;

/** A period that a department head decides on: the subscriptions of the shared pool (K2, K4) have no owner department and are not decided here. */
type OwnedRecord = SubscriptionRecord & { ownerDepartmentId: string };

function isOwned(record: SubscriptionRecord): record is OwnedRecord {
  return record.ownerDepartmentId !== null;
}

function factsOf(record: OwnedRecord, renewedById: string | null): RenewalPeriodFacts {
  const notice = deriveNotice(noticeInputOf(record));

  return {
    subscriptionId: record.id,
    planId: record.planId,
    planName: record.planName,
    planPricingModel: record.planPricingModel,
    applicationId: record.applicationId,
    applicationName: record.applicationName,
    applicationKind: record.applicationKind,
    ownerDepartmentId: record.ownerDepartmentId,
    kind: record.kind,
    status: record.status,
    purchasedQuantity: record.purchasedQuantity,
    unitPrice: record.unitPrice && { amountMinor: record.unitPrice.amountMinor, currency: record.unitPrice.currency },
    billingCycle: record.billingCycle,
    startDate: record.startDate,
    endDate: record.endDate,
    renewalDate: record.renewalDate,
    autoRenew: record.autoRenew,
    allowsMidTermReduction: record.allowsMidTermReduction,
    notice: { source: notice.source, deadline: notice.deadline, baseDate: notice.baseDate },
    renewedFromId: record.renewedFromId,
    renewedById,
  };
}

/**
 * The periods of the subscriptions as the renewal of a subscription reads and continues them (`QĐ-16`, `US-11-03`): the milestone
 * derived by the same rule the subscription is read with, the period that already continues one, and the new period recorded
 * from what the vendor confirmed, chained to the old one in the transaction of the caller. Nothing here decides a renewal.
 */
@Injectable()
export class SubscriptionPeriodService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanFactsService,
    private readonly pricing: SubscriptionPricingService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly pool: SubscriptionPoolService,
  ) {}

  /** The periods with these ids, by id; an id that does not exist is absent. */
  async facts(ids: readonly string[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    const records = await this.subscriptions.findMany(ids, tx);

    return this.withSuccessors(records, tx);
  }

  /** The period, locked `FOR UPDATE` until the caller's transaction ends (the lock a seat of it takes too); null if absent. */
  async lock(tx: DbTx, id: string): Promise<RenewalPeriodFacts | null> {
    const record = await this.subscriptions.lock(tx, id);
    if (!record) return null;

    return (await this.withSuccessors([record], tx))[0];
  }

  /**
   * The active terms the renewal sweep looks at, none of them continued yet: those whose milestone falls between two days, and
   * those that have no milestone at all (the warning of the quality of the contract data). A perpetual purchase and a draft are
   * never among them (`QĐ-49c`).
   */
  async subjects(window: { from: BusinessDate; to: BusinessDate }): Promise<RenewalPeriodFacts[]> {
    const dated = await this.subscriptions.listTermsWithMilestoneBetween(window.from, window.to);
    const { items: undated } = await this.subscriptions.list({
      status: 'ACTIVE',
      kind: 'TERM',
      withoutAlertAnchor: true,
      skip: 0,
      take: SWEEP_LIMIT,
    });
    const facts = await this.withSuccessors([...dated.slice(0, SWEEP_LIMIT), ...undated]);

    return facts.filter((period) => period.renewedById === null);
  }

  /**
   * Records the period the vendor confirmed as the continuation of `previousSubscriptionId`, in the caller's transaction (which
   * holds the old period locked): the same plan, owner and kind, the price recorded and converted today, the link set once. A
   * period that is already continued, one that is not a term, a retired application or a start that is not later is refused
   * with nothing written. Throws SubscriptionPeriodRefusedError.
   */
  async recordNext(tx: DbTx, actor: AuthenticatedPrincipal, input: NextPeriodInput): Promise<RenewalPeriodFacts> {
    const previous = await this.subscriptions.find(input.previousSubscriptionId, tx);
    if (!previous) throw new SubscriptionPeriodRefusedError('NOT_FOUND');
    if (previous.kind !== 'TERM') throw new SubscriptionPeriodRefusedError('NOT_TERM');
    if (!isOwned(previous)) throw new SubscriptionPeriodRefusedError('NO_OWNER_DEPARTMENT');
    if ((await this.subscriptions.successorsOf([previous.id], tx)).has(previous.id)) {
      throw new SubscriptionPeriodRefusedError('ALREADY_RENEWED');
    }
    if (previous.startDate !== null && input.startDate <= previous.startDate) {
      throw new SubscriptionPeriodRefusedError('STARTS_TOO_EARLY');
    }
    const plan = await this.plans.lockShared(tx, previous.planId);
    if (!plan || plan.applicationStatus === 'RETIRED') throw new SubscriptionPeriodRefusedError('APPLICATION_RETIRED');

    // The new period carries what the rules of the shared pool made the old one hold: the commitment, the IT Admin who answers for
    // it and the vendor's minimum; the flag that prices the plan moves to it (QĐ-103e).
    const state = {
      ...declaredStateOf(input),
      commitmentTermMonths: previous.commitmentTermMonths,
      responsibleItAdminEmployeeId: previous.responsibleItAdminEmployeeId,
      vendorMinimumSeats: previous.vendorMinimumSeats,
    };
    this.assertNextPeriod(plan, state, input.billingCycle, previous);
    const money = await this.pricing.read(input.unitPrice);
    const priced = await this.pricing.priceToday(tx, money);
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A renewal was recorded before installation');

    // The flag that prices the plan moves to the new period only when it is written active; a draft period leaves it on the one it continues
    // and `subscriptionComplete` hands it over (F-012).
    const status = subscriptionStatusOf(plan, 'TERM', { ...state, ...priced });
    const takesPrimary = status === 'ACTIVE' && previous.isPrimaryForPlan;
    if (takesPrimary) await this.pool.releasePrimary(tx, actor, organization.id, previous.id);
    const created = await this.subscriptions.insert(tx, {
      organizationId: organization.id,
      planId: previous.planId,
      ownerDepartmentId: previous.ownerDepartmentId,
      kind: 'TERM',
      renewedFromId: previous.id,
      ...state,
      ...priced,
      isPrimaryForPlan: takesPrimary,
      status,
    });
    await this.audit.record(
      tx,
      catalogAuditEvent(actor, organization.id, 'SUBSCRIPTION.RENEWED', 'Subscription', created.id, null, {
        ...snapshotOf(created),
        renewedFromId: previous.id,
      }),
    );

    return factsOf({ ...created, ownerDepartmentId: previous.ownerDepartmentId }, null);
  }

  /**
   * The shape of the new period, then the commitment it inherits against the cycle the vendor confirmed as a new write would meet it
   * (R-G01, R-E01); a cycle of the old kind (QUARTERLY, OTHER) is kept as it is declared until the renewal of W5.
   * Throws SubscriptionPeriodRefusedError.
   */
  private assertNextPeriod(
    plan: { applicationKind: ApplicationKind; provisioningType: ProvisioningType },
    state: ReturnType<typeof declaredStateOf> & { commitmentTermMonths: number | null },
    billingCycle: BillingCycle,
    previous: SubscriptionRecord,
  ): void {
    try {
      assertSubscriptionShape({
        kind: 'TERM',
        applicationKind: plan.applicationKind,
        planProvisioningType: plan.provisioningType,
        ...state,
      });
    } catch {
      throw new SubscriptionPeriodRefusedError('INVALID_DATES');
    }
    try {
      assertPoolTerms({
        kind: 'TERM',
        planProvisioningType: plan.provisioningType,
        billingCycle,
        commitmentTermMonths: previous.commitmentTermMonths,
        activating: false,
      });
    } catch {
      throw new SubscriptionPeriodRefusedError('INVALID_TERMS');
    }
  }

  private async withSuccessors(records: SubscriptionRecord[], tx?: DbTx): Promise<RenewalPeriodFacts[]> {
    const successors = await this.subscriptions.successorsOf(
      records.map((record) => record.id),
      tx,
    );

    return records.filter(isOwned).map((record) => factsOf(record, successors.get(record.id) ?? null));
  }
}
