import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ApplicationKind } from '../catalog-entry/application.types';
import { SubscriptionFactsService } from '../subscription/subscription-facts.service';
import {
  RequestableApplicationNotFoundError,
  RequestablePlanNotFoundError,
  RequestableSoftwareNoDepartmentError,
} from './requestable-software.errors';
import { costsMoney, priceOf, submissionOf } from './requestable-software.policy';
import { RequestableSoftwareRepo } from './requestable-software.repo';
import type {
  RequestableApplicationDetailView,
  RequestableApplicationView,
  RequestablePlanDetailView,
  RequestablePlanRecord,
  RequestablePlanView,
  Submitter,
} from './requestable-software.types';

interface PageQuery {
  search?: string;
  kind?: ApplicationKind;
  page: number;
  pageSize: number;
}

/**
 * The catalog a person picks software from before they preview and send a request (`US-05-01`, main flow): the applications
 * and plans they may ask for, and for each whether their department can send it and price it today. It reads as the preview
 * judges: the department of the day first (none: nothing is offered), then the catalog; a retired application is hidden, and
 * so is every plan of it. Whether the person already holds the plan is the preview's to say: the catalog does not read seats.
 */
@Injectable()
export class RequestableSoftwareService {
  constructor(
    private readonly catalog: RequestableSoftwareRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly subscriptions: SubscriptionFactsService,
  ) {}

  /** Throws RequestableSoftwareNoDepartmentError. */
  async listApplications(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { functionalGroupId?: string },
  ): Promise<Page<RequestableApplicationView>> {
    const submitter = await this.submitter(actor);
    const { items, total } = await this.catalog.listApplications({
      ...(query.search ? { search: query.search } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.functionalGroupId ? { functionalGroupId: query.functionalGroupId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(
      items.map((item) => ({
        ...item,
        costsMoney: costsMoney(item.kind),
        ...submissionOf(item.kind, submitter.hasCostCenter),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws RequestableSoftwareNoDepartmentError and RequestableApplicationNotFoundError. */
  async getApplication(actor: AuthenticatedPrincipal, id: string): Promise<RequestableApplicationDetailView> {
    const submitter = await this.submitter(actor);
    const application = await this.catalog.findApplication(id);
    if (!application) throw new RequestableApplicationNotFoundError();

    return {
      ...application,
      costsMoney: costsMoney(application.kind),
      ...submissionOf(application.kind, submitter.hasCostCenter),
    };
  }

  /** Throws RequestableSoftwareNoDepartmentError. */
  async listPlans(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { applicationId?: string },
  ): Promise<Page<RequestablePlanView>> {
    const submitter = await this.submitter(actor);
    const { items, total } = await this.catalog.listPlans({
      ...(query.search ? { search: query.search } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const views = await this.withAvailability(items, submitter);

    return pageOf(views, total, query.page, query.pageSize);
  }

  /** Throws RequestableSoftwareNoDepartmentError and RequestablePlanNotFoundError. */
  async getPlan(actor: AuthenticatedPrincipal, id: string): Promise<RequestablePlanDetailView> {
    const submitter = await this.submitter(actor);
    const plan = await this.catalog.findPlan(id);
    if (!plan) throw new RequestablePlanNotFoundError();
    const [view] = await this.withAvailability([plan], submitter);

    return view;
  }

  /** The price availability and the gate of every plan of a page, with one read of the prices of the whole page. */
  private async withAvailability<T extends RequestablePlanRecord>(
    plans: readonly T[],
    submitter: Submitter,
  ): Promise<Array<T & Omit<RequestablePlanView, keyof RequestablePlanRecord>>> {
    const paid = plans.filter((plan) => costsMoney(plan.application.kind)).map((plan) => plan.id);
    const cycles = await this.subscriptions.pricedCyclesOfPlans(paid);

    return plans.map((plan) => ({
      ...plan,
      costsMoney: costsMoney(plan.application.kind),
      price: priceOf(plan.application.kind, cycles.get(plan.id)),
      ...submissionOf(plan.application.kind, submitter.hasCostCenter),
    }));
  }

  /** The department of the day of the caller and whether it has a Cost Center in use, read as the preview reads it. */
  private async submitter(actor: AuthenticatedPrincipal): Promise<Submitter> {
    const today = await this.organizationReads.businessToday();
    const unit = (await this.organizationReads.getOwningUnits([actor.employeeId], today)).get(actor.employeeId);
    if (!unit) throw new RequestableSoftwareNoDepartmentError();

    return { departmentId: unit.departmentId, hasCostCenter: unit.costCenter !== null };
  }
}
