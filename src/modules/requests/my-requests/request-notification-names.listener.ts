import { Injectable, OnModuleInit } from '@nestjs/common';
import { distinctUuids } from '../../../core/uuid';
import { CatalogApi } from '../../catalog/public/catalog.api';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../../notifications/public/notifications.extension-points';
import { MyRequestsRepo } from './my-requests.repo';

/**
 * What a notification sentence calls a Request: the application and plan it asks for ("Figma – Professional"), or the name of the software
 * proposed when it is not in the catalog or its plan is not linked yet. A Request that names neither (a group Request) is absent, so the
 * sentence says "a request". The plans are named by the catalog, through its facade, in one read for the page; this module reads no
 * catalog table. It hands itself to the notification inbox when the module starts, so `notifications` never imports `requests`.
 */
@Injectable()
export class RequestNotificationNamesListener implements NotificationNameSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NotificationNameContributions] as const;

  readonly kinds: readonly NameKind[] = ['REQUEST'];

  constructor(
    private readonly requests: MyRequestsRepo,
    private readonly catalog: CatalogApi,
    private readonly nameSources: NotificationNameContributions,
  ) {}

  onModuleInit(): void {
    this.nameSources.add('requests.names', this);
  }

  async names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const wanted = distinctUuids(ids);
    if (kind !== 'REQUEST' || wanted.length === 0) return new Map();
    const software = await this.requests.softwareOf(wanted);
    const planIds = [...new Set([...software.values()].flatMap(({ planId }) => (planId === null ? [] : [planId])))];
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds);
    const planNames = new Map(plans.map((plan) => [plan.planId, `${plan.applicationName} – ${plan.planName}`]));
    const names = new Map<string, string>();
    for (const [id, { planId, proposedName }] of software) {
      const name = (planId === null ? undefined : planNames.get(planId)) ?? proposedName;
      if (name !== null && name !== undefined) names.set(id, name);
    }

    return names;
  }
}
