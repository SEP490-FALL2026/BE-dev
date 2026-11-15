import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { CONTRACT_DETAIL_ARRAY_MAX } from './contract-fields.policy';
import { ContractQueryService } from './contract-query.service';
import type { ContractSubscriptionBrief, ContractSubscriptionRepo } from './contract-subscription.repo';
import { ContractNotFoundError } from './contract.errors';
import type { ContractDetailRow, ContractRepo } from './contract.repo';
import type { AttachedDocumentRow, DocumentRepo } from './document.repo';

const TODAY = '2026-11-15';
const row = (subscriptionCount: number): ContractDetailRow => ({
  id: 'c1',
  name: 'Hợp đồng',
  vendorId: 'v1',
  vendor: { id: 'v1', name: 'Atlassian' },
  number: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  note: null,
  createdByAppUserId: 'u1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  subscriptionCount,
});
const documents = (count: number): AttachedDocumentRow[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `d${index}`,
    purpose: 'CONTRACT_ATTACHMENT',
    fileName: `f${index}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 10,
    attachedAt: new Date('2026-10-02T00:00:00Z'),
  }));
const briefs = (count: number): ContractSubscriptionBrief[] =>
  Array.from({ length: count }, (_, index) => ({
    subscriptionId: `s${index}`,
    status: 'ACTIVE',
    kind: 'TERM',
    startDate: '2026-01-05',
    endDate: null,
    planId: 'p',
    planName: 'Plan',
    provisioningType: 'K2',
    applicationId: `a${index}`,
    applicationName: 'App',
    logoUrl: null,
    linkedAt: new Date('2026-10-03T00:00:00Z'),
  }));

/** The service reads what the repos hold, so the repos are the only things standing in: nothing here is a rule of the service. */
function serviceOf(held: { count: number; documents: number; applications: number }) {
  const asked: Record<string, number> = {};
  const contracts = {
    findDetail: (id: string) => Promise.resolve(id === 'c1' ? row(held.count) : null),
  } as unknown as ContractRepo;
  const links = {
    briefsOf: (_id: string, limit: number) => {
      asked.briefs = limit;

      return Promise.resolve(briefs(Math.min(held.count, limit)));
    },
    applicationIdsOf: (_id: string, limit: number) => {
      asked.applications = limit;

      return Promise.resolve(Array.from({ length: Math.min(held.applications, limit) }, (_, index) => `a${index}`));
    },
  } as unknown as ContractSubscriptionRepo;
  const files = {
    attachedTo: (_id: string, limit: number) => {
      asked.documents = limit;

      return Promise.resolve(documents(Math.min(held.documents, limit)));
    },
  } as unknown as DocumentRepo;
  const organization = { businessToday: () => Promise.resolve(TODAY) } as unknown as OrganizationReadApi;

  return { service: new ContractQueryService(contracts, links, files, organization), asked };
}

describe('the detail of a contract lists a bounded slice of what hangs on it (API-LIST-DETAIL.1)', () => {
  it('lists all of a contract that holds fewer than the most, and says nothing is cut', async () => {
    const { service } = serviceOf({ count: 3, documents: 2, applications: 3 });

    const detail = await service.detail('c1');

    expect(detail).toMatchObject({ status: 'ACTIVE', subscriptionCount: 3 });
    expect([detail.subscriptions.length, detail.documents.length, detail.applicationIds.length]).toEqual([3, 2, 3]);
    expect(detail.truncated).toEqual({ subscriptions: false, documents: false, applicationIds: false });
  });

  it('lists the most of a contract that holds exactly the most and does not call that a cut', async () => {
    const { service } = serviceOf({
      count: CONTRACT_DETAIL_ARRAY_MAX,
      documents: CONTRACT_DETAIL_ARRAY_MAX,
      applications: CONTRACT_DETAIL_ARRAY_MAX,
    });

    const detail = await service.detail('c1');

    expect(detail.documents).toHaveLength(CONTRACT_DETAIL_ARRAY_MAX);
    expect(detail.truncated).toEqual({ subscriptions: false, documents: false, applicationIds: false });
  });

  it('lists the most of a contract that holds more, asks for one more than it lists to know, and says which array was cut', async () => {
    const { service, asked } = serviceOf({
      count: CONTRACT_DETAIL_ARRAY_MAX + 40,
      documents: CONTRACT_DETAIL_ARRAY_MAX + 5,
      applications: CONTRACT_DETAIL_ARRAY_MAX + 1,
    });

    const detail = await service.detail('c1');

    expect([detail.subscriptions.length, detail.documents.length, detail.applicationIds.length]).toEqual([
      CONTRACT_DETAIL_ARRAY_MAX,
      CONTRACT_DETAIL_ARRAY_MAX,
      CONTRACT_DETAIL_ARRAY_MAX,
    ]);
    expect(detail.subscriptionCount).toBe(CONTRACT_DETAIL_ARRAY_MAX + 40);
    expect(detail.truncated).toEqual({ subscriptions: true, documents: true, applicationIds: true });
    expect(asked).toEqual({
      briefs: CONTRACT_DETAIL_ARRAY_MAX,
      documents: CONTRACT_DETAIL_ARRAY_MAX + 1,
      applications: CONTRACT_DETAIL_ARRAY_MAX + 1,
    });
  });

  it('says a contract that does not exist is not found', async () => {
    const { service } = serviceOf({ count: 0, documents: 0, applications: 0 });

    await expect(service.detail('c2')).rejects.toBeInstanceOf(ContractNotFoundError);
  });
});
