import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestSenderService } from '../request-intake/request-sender.service';
import { RequestDraftRepo, type DraftRow } from '../request-draft/request-draft.repo';
import { RequestDraftService } from './request-draft.service';

const PLAN = '0b3f7f4e-5f6c-4d6e-9d8b-2f4f4f4f4f01';

const principal = (employeeId: string): AuthenticatedPrincipal => ({
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId,
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
});

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  id: 'r-1',
  organizationId: 'o-1',
  type: 'GRANT',
  state: 'DRAFT',
  planId: PLAN,
  requesterEmployeeId: 'e-owner',
  departmentId: 'd-1',
  policy: { draft: { kind: 'INDIVIDUAL', planId: PLAN, businessReason: 'Design the brand', termMonths: 3 } },
  savedAt: new Date('2026-10-28T02:00:00Z'),
  ...over,
});

/**
 * Reading a draft through `accessRequestGet`: the person who saved it reads what the list of drafts shows of it, and a
 * request that was sent, a draft of another person and an id that is not there are one answer.
 */
describe('RequestDraftService.readOwn', () => {
  const drafts = { find: jest.fn() };
  let service: RequestDraftService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        RequestDraftService,
        { provide: TransactionRunner, useValue: {} },
        { provide: RequestDraftRepo, useValue: drafts },
        { provide: OrganizationReadApi, useValue: {} },
        { provide: CatalogApi, useValue: {} },
        { provide: AuditApi, useValue: {} },
        { provide: RequestSenderService, useValue: {} },
      ],
    }).compile();
    service = module.get(RequestDraftService);
  });

  it('gives the person who saved the draft what the list of drafts shows of it, with nothing a request would have', async () => {
    drafts.find.mockResolvedValue(row());

    expect(await service.readOwn(principal('e-owner'), 'r-1')).toEqual({
      id: 'r-1',
      kind: 'INDIVIDUAL',
      departmentId: 'd-1',
      planId: PLAN,
      beneficiaryCount: 1,
      createdAt: '2026-10-28T02:00:00.000Z',
    });
  });

  it('answers null for the draft of another person, as it does for an id that is not there', async () => {
    drafts.find.mockResolvedValueOnce(row());
    expect(await service.readOwn(principal('e-other'), 'r-1')).toBeNull();

    drafts.find.mockResolvedValueOnce(null);
    expect(await service.readOwn(principal('e-owner'), 'r-missing')).toBeNull();
  });

  it('answers null for a request of the caller that was sent: it is a request now, read as one', async () => {
    drafts.find.mockResolvedValue(row({ state: 'PENDING' }));

    expect(await service.readOwn(principal('e-owner'), 'r-1')).toBeNull();
  });
});

/**
 * A draft of the kind `SERVICE_ACCOUNT` is saved as the plain request it is until it is sent: the row of that type needs its detail
 * row when the transaction commits, and a draft has none, so the type is `GRANT` and the kind it will be is kept with its content.
 */
describe('RequestDraftService.save', () => {
  const tx = { name: 'tx' };
  const drafts = { insert: jest.fn() };
  const organization = {
    businessToday: jest.fn(),
    getOwningUnits: jest.fn(),
  };
  const sender = { lockEligible: jest.fn() };
  const catalog = { findPlanSeatTargets: jest.fn() };
  const audit = { record: jest.fn() };
  let service: RequestDraftService;

  beforeEach(async () => {
    jest.resetAllMocks();
    sender.lockEligible.mockResolvedValue({ organizationId: 'o-1' });
    organization.businessToday.mockResolvedValue('2026-10-28');
    organization.getOwningUnits.mockResolvedValue(new Map([['e-owner', { departmentId: 'd-1', costCenter: null }]]));
    catalog.findPlanSeatTargets.mockResolvedValue([{ planId: PLAN, applicationKind: 'INTERNAL' }]);
    drafts.insert.mockResolvedValue(
      row({
        policy: {
          draft: {
            kind: 'SERVICE_ACCOUNT',
            planId: PLAN,
            purpose: 'Build bot',
            expectedIdentifier: 'ci-bot-1',
            businessReason: 'Run the builds',
            termMonths: 1,
          },
        },
      }),
    );
    const module = await Test.createTestingModule({
      providers: [
        RequestDraftService,
        { provide: TransactionRunner, useValue: { run: (fn: (client: unknown) => unknown) => fn(tx) } },
        { provide: RequestDraftRepo, useValue: drafts },
        { provide: OrganizationReadApi, useValue: organization },
        { provide: CatalogApi, useValue: catalog },
        { provide: AuditApi, useValue: audit },
        { provide: RequestSenderService, useValue: sender },
      ],
    }).compile();
    service = module.get(RequestDraftService);
  });

  it('writes the draft of a service account as a request of the type GRANT, with the branch of its plan, and answers its kind', async () => {
    const wire = await service.save(principal('e-owner'), {
      kind: 'SERVICE_ACCOUNT',
      planId: PLAN,
      purpose: 'Build bot',
      expectedIdentifier: 'ci-bot-1',
      businessReason: 'Run the builds',
      termMonths: 1,
    } as never);

    expect(drafts.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'GRANT', branch: 'INTERNAL_FREE', planId: PLAN, departmentId: 'd-1' }),
    );
    expect(wire).toMatchObject({ kind: 'SERVICE_ACCOUNT', departmentId: 'd-1', planId: PLAN, beneficiaryCount: 1 });
  });

  it('judges the sender alone for a draft of one person, and the sender with every line for a group draft (D-S21, OD-3)', async () => {
    const group = {
      kind: 'GROUP',
      planId: PLAN,
      lines: [{ employeeId: 'e-1' }, { employeeId: 'e-2' }],
      businessReason: 'The new brand needs the shared workspace',
      termMonths: 3,
    };

    await service.save(principal('e-owner'), group as never);
    await service.save(principal('e-owner'), {
      kind: 'INDIVIDUAL',
      planId: PLAN,
      businessReason: 'x',
      termMonths: 3,
    } as never);

    expect(sender.lockEligible).toHaveBeenNthCalledWith(1, tx, expect.anything(), ['e-1', 'e-2']);
    expect(sender.lockEligible).toHaveBeenNthCalledWith(2, tx, expect.anything(), undefined);
  });

  it('writes nothing when the sender is refused as a party of a request', async () => {
    sender.lockEligible.mockRejectedValue(new Error('refused'));

    await expect(
      service.save(principal('e-owner'), {
        kind: 'INDIVIDUAL',
        planId: PLAN,
        businessReason: 'x',
        termMonths: 3,
      } as never),
    ).rejects.toThrow('refused');

    expect(drafts.insert).not.toHaveBeenCalled();
  });
});
