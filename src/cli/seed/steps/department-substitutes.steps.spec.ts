import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { DEPARTMENT_SUBSTITUTE_STEPS } from './department-substitutes.steps';

const step = DEPARTMENT_SUBSTITUTE_STEPS[0];

function context(active: { substitute: { id: string } }[], mode: 'apply' | 'plan' = 'apply') {
  const ids = emptyIds();
  ids.departments.set('ITO', 'department-ito');
  ids.employees.set('NV-ITA2', 'employee-ita2');
  const call = jest.fn((_email: string, method: string) => Promise.resolve(method === 'GET' ? { items: active } : {}));

  return {
    ctx: { fixture, ids, mode, superAdminEmail: 'sa@example.test', api: { call } } as unknown as DemoRunContext,
    call,
  };
}

describe('the IT Admin who stands in for the department of the person who leaves (QĐ-118, W2-27)', () => {
  it('is named by the Super Admin for the department with the reason of the fixture, once', async () => {
    const { ctx, call } = context([]);

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'done' });

    expect(call).toHaveBeenCalledWith('sa@example.test', 'POST', '/departments/department-ito/it-substitutes', {
      substituteEmployeeId: 'employee-ita2',
      reason: fixture.departmentSubstitutes[0].reason,
    });
  });

  it('leaves the appointment in force as it is, and reports another IT Admin already standing in as a difference, never replacing them', async () => {
    const same = context([{ substitute: { id: 'employee-ita2' } }]);
    await expect(step.run(same.ctx)).resolves.toMatchObject({ status: 'present' });
    expect(same.call).toHaveBeenCalledTimes(1);

    const other = context([{ substitute: { id: 'employee-other' } }]);
    await expect(step.run(other.ctx)).resolves.toMatchObject({ status: 'conflict' });
    expect(other.call).toHaveBeenCalledTimes(1);
  });

  it('writes nothing in a plan run', async () => {
    const { ctx, call } = context([], 'plan');

    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'planned' });

    expect(call).toHaveBeenCalledTimes(1);
  });
});
