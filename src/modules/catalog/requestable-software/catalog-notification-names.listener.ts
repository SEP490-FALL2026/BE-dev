import { Injectable, OnModuleInit } from '@nestjs/common';
import { distinctUuids } from '../../../core/uuid';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../../notifications/public/notifications.extension-points';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { applicationPlanName } from '../plan/plan.policy';
import { PlanRepo } from '../plan/plan.repo';
import { SubscriptionRepo } from '../subscription/subscription.repo';

/**
 * What a notification sentence calls an application, a plan and a subscription: the application by its name, a plan and a subscription by
 * "application – plan". It hands itself to the notification inbox when the module starts, so `notifications` never imports the catalog:
 * one read of the owning table for the ids of a page, and an id that does not exist or is not a uuid is simply absent. It lives with
 * `requestable-software`, the capability that already reads the application, the plan and the subscription together, so it adds no edge
 * between capabilities (`subscription/` is at the 25-file limit and `catalog-entry` cannot import `plan`).
 */
@Injectable()
export class CatalogNotificationNamesListener implements NotificationNameSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NotificationNameContributions] as const;

  readonly kinds: readonly NameKind[] = ['APPLICATION', 'PLAN', 'SUBSCRIPTION'];

  constructor(
    private readonly applications: ApplicationRepo,
    private readonly plans: PlanRepo,
    private readonly subscriptions: SubscriptionRepo,
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

    return this.subscriptions.labelsOf(wanted, undefined, applicationPlanName);
  }
}
