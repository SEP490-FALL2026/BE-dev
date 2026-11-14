import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { termRunOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { pricedPeopleIds } from '../access-request/group-request.types';

/**
 * The last day of the right of each person a request is priced for, when it is priced as of a day (`QĐ-109e`, `QĐ-111i`, R-38): the months of
 * use it asked for from that day, cut at the end of the contract of a person who has one. Only a request of this release is worked out so (it
 * keeps its months and no end date); a request to go on using, a request of an older release that carries an end date and a right with no
 * end are priced by the end date they have, or none.
 */
@Injectable()
export class RequestTermEndsService {
  constructor(private readonly organizationReads: OrganizationReadApi) {}

  /** The ends in the order of the people priced, or null when the request is not priced by a time of use. */
  async of(
    tx: DbTx,
    request: Pick<
      AccessRequestRecord,
      'type' | 'termMonths' | 'expectedEndDate' | 'beneficiaryEmployeeIds' | 'lines'
    > & {
      renewal?: unknown;
    },
    asOf: BusinessDate,
  ): Promise<(BusinessDate | null)[] | null> {
    if (request.renewal || request.termMonths === null || request.expectedEndDate !== null) return null;
    const ids =
      request.type === 'GROUP_GRANT'
        ? pricedPeopleIds(request.lines.map((line) => ({ employeeId: line.employeeId, state: line.state })))
        : request.beneficiaryEmployeeIds;

    return this.endsOfPeople(tx, request.termMonths, ids, asOf);
  }

  /** The last day of the right of each of these people if `months` months of use began on `asOf`: cut at the end of the contract of a person who has one. */
  async endsOfPeople(
    tx: DbTx,
    months: number | null,
    employeeIds: readonly string[],
    asOf: BusinessDate,
  ): Promise<(BusinessDate | null)[]> {
    const people = new Map(
      (await this.organizationReads.getEmployees([...employeeIds], tx)).map((person) => [person.id, person]),
    );

    return employeeIds.map(
      (id) => termRunOf({ start: asOf, months, contractEndsOn: people.get(id)?.contractEndsOn ?? null }).end,
    );
  }
}
