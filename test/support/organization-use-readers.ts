import type { INestApplication } from '@nestjs/common';
import {
  CostCenterUseContributions,
  DepartmentUseContributions,
} from '../../src/modules/organization/public/organization.extension-points';
import type { UseItem } from '../../src/modules/organization/public/organization-use.types';

/**
 * What keeps a department or a Cost Center in use, as a test says it (`QĐ-90e`, `QĐ-87d(2)`). The real facts live in other modules
 * (Requests, personnel events, tasks, subscriptions, commitments), which add their readers to the organization when they
 * start; a suite of the organization alone has none of them, and retiring fails loudly when a group has no reader. This adds
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
  const departmentUse = app.get(DepartmentUseContributions, { strict: false });
  const costCenterUse = app.get(CostCenterUseContributions, { strict: false });
  const facts: UseFacts = { openWork: [], subscriptions: [], requests: [], commitments: [] };
  const answer = (items: UseItem[], limit: number) =>
    Promise.resolve({ items: items.slice(0, limit), total: items.length });

  departmentUse.add('test.open-work', {
    group: 'OPEN_WORK',
    read: (_id, _day, limit) => answer(facts.openWork, limit),
  });
  departmentUse.add('test.subscriptions', {
    group: 'SUBSCRIPTIONS',
    read: (_id, _day, limit) => answer(facts.subscriptions, limit),
  });
  costCenterUse.add('test.requests', { group: 'REQUESTS', read: (_id, limit) => answer(facts.requests, limit) });
  costCenterUse.add('test.commitments', {
    group: 'COMMITMENTS',
    read: (_id, limit) => answer(facts.commitments, limit),
  });

  return facts;
}
