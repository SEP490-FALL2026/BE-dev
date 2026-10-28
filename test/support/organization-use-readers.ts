import type { INestApplication } from '@nestjs/common';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import type { UseItem } from '../../src/modules/organization/organization-use.types';

/**
 * What keeps a department or a Cost Center in use, as a test says it (`QĐ-90e`, `QĐ-87d(2)`). The real facts live in other modules
 * (Requests, personnel events, tasks, subscriptions, commitments), which register their readers with the organization when they
 * start; a suite of the organization alone has none of them, and retiring fails loudly when a group has no reader. This registers
 * one reader per group that answers from the returned object, so a case sets what it needs and every group answers by default
 * with nothing.
 */
export interface UseFacts {
  /** Requests not over, personnel events waiting and open tasks of the department. */
  openWork: UseItem[];
  /** Subscriptions and purchases the department owns that still owe a payment. */
  subscriptions: UseItem[];
  /** Requests with a cost that are not over, of the Cost Center. */
  requests: UseItem[];
  /** Commitments still held on the Cost Center. */
  commitments: UseItem[];
}

export function registerUseReaders(app: INestApplication): UseFacts {
  const organization = app.get(OrganizationService);
  const facts: UseFacts = { openWork: [], subscriptions: [], requests: [], commitments: [] };
  const answer = (items: UseItem[], limit: number) =>
    Promise.resolve({ items: items.slice(0, limit), total: items.length });

  organization.registerDepartmentUseReader({
    group: 'OPEN_WORK',
    read: (_id, _day, limit) => answer(facts.openWork, limit),
  });
  organization.registerDepartmentUseReader({
    group: 'SUBSCRIPTIONS',
    read: (_id, _day, limit) => answer(facts.subscriptions, limit),
  });
  organization.registerCostCenterUseReader({ group: 'REQUESTS', read: (_id, limit) => answer(facts.requests, limit) });
  organization.registerCostCenterUseReader({
    group: 'COMMITMENTS',
    read: (_id, limit) => answer(facts.commitments, limit),
  });

  return facts;
}
