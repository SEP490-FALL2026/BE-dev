import type { DepartmentHeadRepo } from './department-head.repo';
import type { DepartmentItCoverageRepo } from './department-it-coverage.repo';
import { DepartmentRecordService } from './department-record.service';
import type { DepartmentRepo } from './department.repo';

describe('DepartmentRecordService (scopes and active substitutes)', () => {
  const tx = { name: 'tx' } as never;

  const makeService = (overrides?: {
    activeDepartments?: {
      id: string;
      code: string;
      name: string;
      itAdminEmployeeId: string | null;
      itAdminStatus: 'ACTIVE' | 'TERMINATED' | null;
      starting: boolean;
    }[];
    activeSubstitutes?: {
      departmentId: string;
      substituteEmployeeId: string;
      substituteStatus: 'ACTIVE' | 'TERMINATED';
    }[];
    inChargeIds?: string[];
  }) => {
    const departments = {
      activeDepartmentsWithItAdmin: jest.fn().mockResolvedValue(overrides?.activeDepartments ?? []),
      idsInChargeOf: jest.fn().mockResolvedValue(overrides?.inChargeIds ?? []),
      findByIds: jest.fn().mockResolvedValue([]),
    };
    const coverage = {
      activeItSubstitutes: jest.fn().mockResolvedValue(overrides?.activeSubstitutes ?? []),
      activeItSubstitutesFor: jest.fn().mockResolvedValue(overrides?.activeSubstitutes ?? []),
    };
    const heads = {} as DepartmentHeadRepo;
    const service = new DepartmentRecordService(
      departments as unknown as DepartmentRepo,
      heads,
      coverage as unknown as DepartmentItCoverageRepo,
    );

    return { service, departments };
  };

  it('itAdminScopeOf includes common queue, named in-charge (including retired), and active usable substitute', async () => {
    const { service } = makeService({
      activeDepartments: [
        {
          id: 'd-common',
          code: 'C',
          name: 'Common',
          itAdminEmployeeId: 'ha',
          itAdminStatus: 'ACTIVE',
          starting: false,
        },
        { id: 'd-sub', code: 'S', name: 'Sub', itAdminEmployeeId: 'other', itAdminStatus: 'ACTIVE', starting: true },
        {
          id: 'd-other',
          code: 'O',
          name: 'Other',
          itAdminEmployeeId: 'other',
          itAdminStatus: 'ACTIVE',
          starting: false,
        },
      ],
      activeSubstitutes: [{ departmentId: 'd-sub', substituteEmployeeId: 'minh', substituteStatus: 'ACTIVE' }],
      inChargeIds: ['d-retired-mine'],
    });

    const usable = jest.fn().mockResolvedValue(new Set(['other', 'minh']));
    const scope = await service.itAdminScopeOf('minh', usable, tx);

    expect(usable).toHaveBeenCalledWith(['ha', 'other', 'minh']);
    expect(scope.sort()).toEqual(['d-common', 'd-retired-mine', 'd-sub']);
  });

  it('itAdminActingScopeOf excludes common queue and includes only usable in-charge or usable substitute', async () => {
    const { service } = makeService({
      activeDepartments: [
        {
          id: 'd-common',
          code: 'C',
          name: 'Common',
          itAdminEmployeeId: 'ha',
          itAdminStatus: 'ACTIVE',
          starting: false,
        },
        { id: 'd-sub', code: 'S', name: 'Sub', itAdminEmployeeId: 'other', itAdminStatus: 'ACTIVE', starting: false },
        { id: 'd-mine', code: 'M', name: 'Mine', itAdminEmployeeId: 'minh', itAdminStatus: 'ACTIVE', starting: false },
      ],
      activeSubstitutes: [{ departmentId: 'd-sub', substituteEmployeeId: 'minh', substituteStatus: 'ACTIVE' }],
    });

    const usable = jest.fn().mockResolvedValue(new Set(['other', 'minh']));
    const scope = await service.itAdminActingScopeOf('minh', usable, tx);

    expect(scope.sort()).toEqual(['d-mine', 'd-sub']);
  });
});
