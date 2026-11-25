import { peopleOf, toWorkspaceDetailWire, toWorkspaceSummaryWire, type WorkspaceContext } from './workspace.mapper';
import type { WorkspaceRecord } from './workspace.types';

const record = (overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord => ({
  id: 'ws-1',
  organizationId: 'org-1',
  vendorId: 'v-1',
  vendorName: 'Anthropic',
  name: 'Anthropic',
  ownerAccountEmail: 'it@acme.vn',
  primaryOwnerEmployeeId: 'khoa',
  responsibleItAdminEmployeeId: 'khoa',
  ownerLimit: null,
  adminLimit: null,
  ownerTransferProcedure: null,
  emergencyAccount: null,
  adminNote: null,
  admins: [
    { employeeId: 'khoa', role: 'OWNER' },
    { employeeId: 'nam', role: 'ADMIN' },
  ],
  createdAt: new Date('2026-12-01T00:00:00.000Z'),
  updatedAt: new Date('2026-12-02T03:04:05.678Z'),
  ...overrides,
});

const context = (working: string[]): WorkspaceContext => ({
  names: new Map([
    ['khoa', 'Khoa'],
    ['nam', 'Nam'],
    ['lan', 'Lan'],
  ]),
  working: new Set(working),
  subscriptionCount: 2,
});

describe('the answers about a workspace', () => {
  it('counts the administrators and those who work, names the vendor and who answers for it', () => {
    expect(toWorkspaceSummaryWire(record(), context(['khoa', 'nam']))).toEqual({
      id: 'ws-1',
      vendor: { id: 'v-1', name: 'Anthropic' },
      name: 'Anthropic',
      adminCount: 2,
      workingAdminCount: 2,
      flags: [],
      responsibleItAdmin: { employeeId: 'khoa', name: 'Khoa' },
      subscriptionCount: 2,
    });
  });

  it('flags a workspace with fewer than two administrators who work, and marks the one who no longer works', () => {
    const detail = toWorkspaceDetailWire(record(), context(['khoa']));

    expect(detail.flags).toEqual(['ADMINS_BELOW_MINIMUM']);
    expect(detail.workingAdminCount).toBe(1);
    expect(detail.admins).toEqual([
      { employeeId: 'khoa', name: 'Khoa', role: 'OWNER', flags: [] },
      { employeeId: 'nam', name: 'Nam', role: 'ADMIN', flags: ['ADMIN_NOT_WORKING'] },
    ]);
  });

  it('says nobody answers for a workspace and that the owner email is missing, and gives the version as an instant', () => {
    const detail = toWorkspaceDetailWire(
      record({ responsibleItAdminEmployeeId: null, ownerAccountEmail: null, primaryOwnerEmployeeId: null }),
      context(['khoa', 'nam']),
    );

    expect(detail.flags).toEqual(['NO_OWNER_EMAIL', 'NO_RESPONSIBLE']);
    expect(detail.responsibleItAdmin).toBeNull();
    expect(detail.primaryOwner).toBeNull();
    expect(detail.updatedAt).toBe('2026-12-02T03:04:05.678Z');
  });

  it('names the holder of the emergency account and keeps its review day as it is', () => {
    const detail = toWorkspaceDetailWire(
      record({
        emergencyAccount: {
          identity: 'break-glass',
          occupiesSeat: true,
          holderEmployeeId: 'lan',
          lastReviewedOn: '2026-11-30',
        },
      }),
      context(['khoa', 'nam']),
    );

    expect(detail.emergencyAccount).toEqual({
      identity: 'break-glass',
      occupiesSeat: true,
      holder: { employeeId: 'lan', name: 'Lan' },
      lastReviewedOn: '2026-11-30',
    });
  });

  it('fails loudly when a person of a workspace is not an employee', () => {
    expect(() => toWorkspaceSummaryWire(record(), { ...context(['khoa']), names: new Map() })).toThrow(
      'A person of a workspace is not an employee',
    );
  });

  it('lists everyone a workspace names, to read their names in one go', () => {
    expect(
      peopleOf(
        record({
          emergencyAccount: {
            identity: 'x',
            occupiesSeat: false,
            holderEmployeeId: 'lan',
            lastReviewedOn: '2026-11-30',
          },
        }),
      ).sort(),
    ).toEqual(['khoa', 'khoa', 'khoa', 'lan', 'nam']);
  });
});
