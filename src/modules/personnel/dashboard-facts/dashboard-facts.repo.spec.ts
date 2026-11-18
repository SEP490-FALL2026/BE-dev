import { toDateColumn } from '../../../core/business-date';
import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PersonnelDashboardFactsRepo } from './dashboard-facts.repo';

const FROM = '2026-11-02';
const TO = '2026-11-30';

/** The repo over a stand-in of the database that records what it was asked and answers with the rows given. */
function build(rows: unknown[]) {
  const findMany = jest.fn<Promise<unknown[]>, [{ where: Record<string, unknown> }]>().mockResolvedValue(rows);
  const repo = new PersonnelDashboardFactsRepo({ offboardingCase: { findMany } } as unknown as PrismaService);

  return { repo, findMany };
}

const row = (departmentId: string | null) => ({
  id: 'case-1',
  employeeId: 'emp-1',
  departmentId,
  lastWorkingDay: toDateColumn('2026-11-10'),
  revocationDueOn: toDateColumn('2026-11-12'),
});

describe('the windows of the revocations of the departures', () => {
  it('reads the whole company without asking for a department, so a person with no department is in it (the Super Admin)', async () => {
    const { repo, findMany } = build([row(null), row('dep-1')]);

    const windows = await repo.departureWindows({ from: FROM, to: TO });

    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('departmentId');
    expect(windows.map((window) => window.departmentId)).toEqual([null, 'dep-1']);
    expect(windows[0]).toEqual({
      id: 'case-1',
      employeeId: 'emp-1',
      departmentId: null,
      startOn: '2026-11-11',
      dueOn: '2026-11-12',
    });
  });

  it('narrows to the departments of an IT Admin when it is given them, and nothing outside them is asked for', async () => {
    const { repo, findMany } = build([row('dep-1')]);

    await repo.departureWindows({ from: FROM, to: TO, departmentIds: ['dep-1', 'dep-2'] });

    expect(findMany.mock.calls[0][0].where.departmentId).toEqual({ in: ['dep-1', 'dep-2'] });
  });

  it('reads nothing for an IT Admin who is in charge of no department', async () => {
    const { repo, findMany } = build([row('dep-1')]);

    expect(await repo.departureWindows({ from: FROM, to: TO, departmentIds: [] })).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps only the departures that carry a deadline', async () => {
    const { repo, findMany } = build([]);

    await repo.departureWindows({ from: FROM, to: TO });

    expect(findMany.mock.calls[0][0].where.revocationDueOn).toEqual({ not: null });
  });
});
