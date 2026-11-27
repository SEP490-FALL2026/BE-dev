import { Injectable, OnModuleInit } from '@nestjs/common';
import { distinctUuids } from '../../../core/uuid';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../../notifications/public/notifications.extension-points';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { LicenseLotRepo } from '../license-lot/license-lot.repo';
import { applicationPlanName } from '../plan/plan.policy';
import { PlanRepo } from '../plan/plan.repo';
import { SubscriptionRepo } from '../subscription/subscription.repo';
import { WorkspaceRepo } from '../workspace/workspace.repo';

/**
 * What a notification sentence calls an application, a plan, a subscription, a workspace, and a license lot: the application and workspace
 * by name, a plan and a subscription by "application – plan", and a lot by "application – plan (purchasedOn)".
 */
@Injectable()
export class CatalogNotificationNamesListener implements NotificationNameSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NotificationNameContributions] as const;

  readonly kinds: readonly NameKind[] = ['APPLICATION', 'PLAN', 'SUBSCRIPTION', 'WORKSPACE', 'LICENSE_LOT'];

  constructor(
    private readonly applications: ApplicationRepo,
    private readonly plans: PlanRepo,
    private readonly subscriptions: SubscriptionRepo,
    private readonly workspaces: WorkspaceRepo,
    private readonly lots: LicenseLotRepo,
    private readonly nameSources: NotificationNameContributions,
  ) {}

  onModuleInit(): void {
    this.nameSources.add('catalog.names', this);
  }

  async names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (!this.kinds.includes(kind)) return new Map();
    const wanted = distinctUuids(ids);
    if (wanted.length === 0) return new Map();
    if (kind === 'APPLICATION') return this.applications.namesOf(wanted);
    if (kind === 'PLAN') return this.plans.namesOf(wanted);
    if (kind === 'WORKSPACE') return this.workspaces.namesOf(wanted);
    if (kind === 'LICENSE_LOT') return this.lotNames(wanted);

    return this.subscriptions.labelsOf(wanted, undefined, applicationPlanName);
  }

  private async lotNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const byId = await this.lots.findMany(ids);
    if (byId.size === 0) return new Map();
    const planNames = await this.plans.namesOf([...new Set([...byId.values()].map((lot) => lot.planId))]);
    const labels = new Map<string, string>();
    for (const lot of byId.values()) {
      const planName = planNames.get(lot.planId);
      labels.set(lot.id, planName ? `${planName} (${lot.purchasedOn})` : lot.purchasedOn);
    }

    return labels;
  }
}
