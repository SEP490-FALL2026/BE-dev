import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../../catalog-audit-event.mapper';
import { PlanFactsService } from '../../plan/plan-facts.service';
import { SubscriptionPeriodRefusedError } from '../../public/subscription-period.errors';
import type {
  NextPeriodInput,
  PaymentScheduleFacts,
  PeriodAdjustment,
  RenewalPeriodFacts,
  SubscriptionPurchaseFacts,
} from '../../public/subscription-period.types';
import { adjustmentCommitmentOf, adjustmentPointOf, redAlertOf } from '../obligation/subscription-obligation.policy';
import { assertPoolTerms } from '../pool/subscription-pool.policy';
import { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { snapshotOf } from '../subscription.mapper';
import { monthlyCostOf } from '../price/subscription-price.policy';
import {
  assertSubscriptionShape,
  declaredStateOf,
  deriveNotice,
  noticeInputOf,
  subscriptionStatusOf,
} from '../subscription.policy';
import { SubscriptionPriceNotVndError } from '../subscription.errors';
import { SubscriptionPeriodRepo } from './subscription-period.repo';
import { SubscriptionRepo, type PaidTermRow } from '../subscription.repo';
import { SubscriptionPricingService } from '../subscription-pricing.service';
import type { ApplicationKind, BillingCycle, ProvisioningType, SubscriptionRecord } from '../subscription.types';

/** How many periods one pass of the renewal sweep reads at most; the next pass takes the rest. */
const SWEEP_LIMIT = 500;

/** The point of adjustment of a period on `today`, with the red alert of a plan by the year; null when no date gives a point. */
function adjustmentOf(record: SubscriptionRecord, today: BusinessDate): PeriodAdjustment | null {
  const point = adjustmentPointOf(record, today);
  if (point === null) return null;
  const commitment = adjustmentCommitmentOf(record);

  return {
    kind: point.kind,
    deadline: point.deadline,
    point: point.point,
    end: point.end,
    redAlertOn: redAlertOf(point.deadline, commitment),
    commitment,
  };
}

function factsOf(record: SubscriptionRecord, renewedById: string | null, today: BusinessDate): RenewalPeriodFacts {
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
    responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
    provisioningType: record.planProvisioningType,
    commitmentTermMonths: record.commitmentTermMonths,
    vendorMinimumSeats: record.vendorMinimumSeats,
    isPrimaryForPlan: record.isPrimaryForPlan,
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
    adjustment: adjustmentOf(record, today),
    renewedFromId: record.renewedFromId,
    renewedById,
  };
}

/** The payment schedule of a row that has what one needs (a cycle and a start day); a row that lacks one has no payment day. */
function scheduleOf(row: PaidTermRow): PaymentScheduleFacts | null {
  if (row.startDate === null) return null;
  if (row.billingCycle !== 'MONTHLY' && row.billingCycle !== 'QUARTERLY' && row.billingCycle !== 'ANNUAL') return null;

  return {
    subscriptionId: row.id,
    planId: row.planId,
    ownerDepartmentId: row.ownerDepartmentId,
    billingCycle: row.billingCycle,
    startDate: fromDateColumn(row.startDate),
    endDate: row.endDate ? fromDateColumn(row.endDate) : null,
    renewalDate: row.renewalDate ? fromDateColumn(row.renewalDate) : null,
    autoRenew: row.autoRenew,
    recordedAt: row.createdAt,
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
    private readonly periods: SubscriptionPeriodRepo,
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

  /** What a purchase invoice reads of the subscriptions with these ids, the shared pool's included; an id that does not exist is absent. */
  async purchaseFacts(ids: readonly string[], tx?: DbTx): Promise<SubscriptionPurchaseFacts[]> {
    return (await this.subscriptions.findMany(ids, tx)).map((record) => ({
      subscriptionId: record.id,
      planId: record.planId,
      ownerDepartmentId: record.ownerDepartmentId,
      responsibleItAdminEmployeeId: record.responsibleItAdminEmployeeId,
      purchasedQuantity: record.purchasedQuantity,
      ...monthlyCostOf(record),
      renewalDate: record.renewalDate,
    }));
  }

  /** The period, locked `FOR UPDATE` until the caller's transaction ends (the lock a seat of it takes too); null if absent. */
  async lock(tx: DbTx, id: string): Promise<RenewalPeriodFacts | null> {
    const record = await this.subscriptions.lock(tx, id);
    if (!record) return null;

    return (await this.withSuccessors([record], tx))[0];
  }

  /**
   * The active K2 terms (the shared pool's workspaces, those of a department too) that no later period continues, at most `SWEEP_LIMIT`:
   * the periods that have a point of adjustment (`SBF-20`). A perpetual purchase, a draft and the other kinds of plan are never among them.
   */
  async adjustmentSubjects(): Promise<RenewalPeriodFacts[]> {
    const records = await this.subscriptions.findMany(await this.periods.listAdjustmentSubjectIds(SWEEP_LIMIT));
    const facts = await this.withSuccessors(records);

    return facts.filter((period) => period.renewedById === null);
  }

  /**
   * The subscriptions that run a period, with the days their payments follow (`PI-2`): `departmentIds` narrows to those departments and the
   * shared pool, which no department owns and every IT Admin works; null reads every one. One statement; the invoices of the periods are not read here.
   */
  async paymentSchedules(departmentIds: readonly string[] | null, tx?: DbTx): Promise<PaymentScheduleFacts[]> {
    return (await this.subscriptions.listPaidTerms(departmentIds, tx)).flatMap((row) => scheduleOf(row) ?? []);
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
    // A price is entered in dong only (`QĐ-111an`): the continuation of a period is refused for one in another currency, nothing written.
    const money = await this.pricing.read(input.unitPrice).catch((error: unknown) => {
      if (error instanceof SubscriptionPriceNotVndError) throw new SubscriptionPeriodRefusedError('PRICE_NOT_VND');
      throw error;
    });
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
      originalPrice: null,
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

    return factsOf(created, null, await this.organizationReads.businessToday(new Date(), tx));
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

    const today = await this.organizationReads.businessToday(new Date(), tx);

    return records.map((record) => factsOf(record, successors.get(record.id) ?? null, today));
  }
}
