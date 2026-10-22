import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { OrganizationService } from '../../organization/organization.service';
import { ApplicationNotFoundError } from './application.errors';
import { replacementRequired } from './application.policy';
import { ApplicationRepo } from './application.repo';
import type { ApplicationKind, BusinessOwnerView } from './application.types';

export interface OwnerWarning {
  applicationId: string;
  applicationName: string;
  kind: ApplicationKind;
  businessOwner: BusinessOwnerView;
}

export interface OwnerPeriodView {
  employee: BusinessOwnerView;
  assignedAt: Date;
  assignedBy: string | null;
  endedAt: Date | null;
}

interface EmployeeFacts {
  id: string;
  employeeCode: string;
  fullName: string;
  status: 'ACTIVE' | 'TERMINATED';
}

function viewOf(employee: EmployeeFacts | undefined): BusinessOwnerView {
  if (!employee) throw new Error('A Business Owner of an application is not an employee');

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    status: employee.status,
  };
}

/**
 * The Business Owners of the applications over time, and the alert that one has to be replaced (`US-04-06`). The alert is
 * read from the employee status when asked for, so it closes by itself once a working owner is named and needs no event
 * from the people side. The owner who left stays on the application until then (`INV-06`).
 */
@Injectable()
export class ApplicationOwnerService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly organization: OrganizationService,
  ) {}

  /** Every application, of every kind, whose Business Owner has left, by name. */
  async warnings(query: { page: number; pageSize: number }): Promise<Page<OwnerWarning>> {
    const ownerIds = await this.applications.currentOwnerIds();
    const owners = new Map((await this.organization.getEmployees(ownerIds)).map((employee) => [employee.id, employee]));
    const departed = ownerIds.filter((id) => {
      const owner = owners.get(id);

      return owner !== undefined && replacementRequired(owner.status);
    });
    if (departed.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { items, total } = await this.applications.listByOwners(
      departed,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(
      items.map((item) => ({
        applicationId: item.id,
        applicationName: item.name,
        kind: item.kind,
        businessOwner: viewOf(owners.get(item.businessOwnerEmployeeId)),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws ApplicationNotFoundError. The periods of the application Business Owner, the latest first. */
  async history(applicationId: string): Promise<OwnerPeriodView[]> {
    if (!(await this.applications.find(applicationId))) throw new ApplicationNotFoundError();
    const periods = await this.applications.listOwnerPeriods(applicationId);
    const employees = new Map(
      (await this.organization.getEmployees([...new Set(periods.map((period) => period.employeeId))])).map(
        (employee) => [employee.id, employee],
      ),
    );

    return periods.map((period) => ({
      employee: viewOf(employees.get(period.employeeId)),
      assignedAt: period.assignedAt,
      assignedBy: period.assignedByAppUserId,
      endedAt: period.endedAt,
    }));
  }
}
