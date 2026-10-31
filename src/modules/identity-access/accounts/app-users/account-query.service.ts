import { Injectable } from '@nestjs/common';
import { cutHistory } from '../../../../core/application/pagination';
import { businessDateAt, toDateColumn } from '../../../../core/business-date';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { DeliveryState } from '../../../notifications/public/notifications.types';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { EmployeeCandidate } from '../../../organization/public/organization.types';
import {
  AccountListFilter,
  AccountRecord,
  ActivationState,
  AppRole,
  AppUserStatus,
  RoleGrantRecord,
} from '../../public/identity-access.types';
import { employeeHasNotLeft } from '../account.policy';
import { AccountRecordService } from '../account-record.service';
import { AccountNotFoundError } from '../account.errors';
import { ActionLinkService } from '../action-link.service';
import { RoleGrantService } from '../role-grant.service';

export interface AccountView {
  id: string;
  loginEmail: string;
  status: AppUserStatus;
  activationState: ActivationState;
  createdAt: Date;
  employee: { id: string; employeeCode: string; fullName: string } | null;
  roles: AppRole[];
}

export interface InvitationView {
  /** Delivery state of the latest invitation mail; null when no invitation was ever created. */
  delivery: DeliveryState | null;
  /** Whether the latest link could still be used to activate the account. */
  usable: boolean;
  expiresAt: Date;
}

export interface AccountDetailView extends AccountView {
  roleHistory: RoleGrantRecord[];
  /** The account has older grants than the {@link ROLE_HISTORY_LIMIT} shown. */
  roleHistoryHasMore: boolean;
  invitation: InvitationView | null;
}

export interface AccountPage {
  items: AccountView[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** The candidate list shows at most this many people (spec 1b). */
const CANDIDATE_LIMIT = 20;

/** Reads for account administration: candidates, the account list and one account. */
/** How many grants of one account the detail shows, the newest; older ones are reported by `roleHistoryHasMore`. */
export const ROLE_HISTORY_LIMIT = 50;

@Injectable()
export class AccountQueryService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly grants: RoleGrantService,
    private readonly links: ActionLinkService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
  ) {}

  /** Employees who have not left and have no account yet. */
  async listCandidates(search: string | undefined): Promise<EmployeeCandidate[]> {
    const organization = await this.organizationReads.getOrganization();
    const today = toDateColumn(businessDateAt(new Date(), organization?.timeZone ?? 'UTC'));
    // Every employee who already has an account, handed to the organization module so it can leave
    // them out in the same query that searches, sorts and limits: no window, no page cap.
    const withAccount = await this.accounts.findEmployeeIdsWithAccount();

    return this.organizationReads.searchActiveEmployees(search, today, CANDIDATE_LIMIT, withAccount);
  }

  async listAccounts(
    filter: Omit<AccountListFilter, 'skip' | 'take'> & { page: number; pageSize: number },
  ): Promise<AccountPage> {
    const { page, pageSize, ...criteria } = filter;
    const { items, total } = await this.accounts.listAccountRecords({
      ...criteria,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const views = await this.toViews(items);

    return {
      items: views,
      pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getAccount(appUserId: string): Promise<AccountDetailView> {
    const record = await this.accounts.findAccountRecord(appUserId);
    if (!record) throw new AccountNotFoundError();

    return this.toDetail(record);
  }

  private async toViews(records: AccountRecord[]): Promise<AccountView[]> {
    const employees = new Map(
      (await this.organizationReads.getEmployees(records.map((record) => record.employeeId))).map((employee) => [
        employee.id,
        employee,
      ]),
    );
    const roles = await this.grants.effectiveRolesFor(records.map((record) => record.id));

    return records.map((record) => {
      const employee = employees.get(record.employeeId);

      return {
        id: record.id,
        loginEmail: record.loginEmail,
        status: record.status,
        activationState: record.activationState,
        createdAt: record.createdAt,
        employee: employee
          ? { id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName }
          : null,
        roles: roles.get(record.id) ?? [],
      };
    });
  }

  private async toDetail(record: AccountRecord): Promise<AccountDetailView> {
    const [view] = await this.toViews([record]);
    const [roleHistory, token] = await Promise.all([
      this.grants.grantHistory(record.id, ROLE_HISTORY_LIMIT + 1),
      this.links.latestToken(record.id),
    ]);
    let invitation: InvitationView | null = null;
    if (token) {
      const delivery = (await this.notifications.deliveryStates([token.tokenHash])).get(token.tokenHash) ?? null;
      invitation = {
        delivery,
        usable:
          token.consumedAt === null &&
          token.revokedAt === null &&
          token.expiresAt > new Date() &&
          employeeHasNotLeft(await this.organizationReads.getEmployee(record.employeeId)),
        expiresAt: token.expiresAt,
      };
    }

    const cut = cutHistory(roleHistory, ROLE_HISTORY_LIMIT);

    return { ...view, roleHistory: cut.items.reverse(), roleHistoryHasMore: cut.hasMore, invitation };
  }
}
