import type { GrantExecution } from '../../licensing/public/licensing-open-grants.types';
import { executionOf } from './grant-queue.mapper';

const task = (overrides: Partial<GrantExecution>): GrantExecution => ({
  requestId: 'req-1',
  employeeId: 'emp-1',
  taskId: 'task-1',
  status: 'IN_PROGRESS',
  channel: 'MANUAL',
  failureReason: null,
  createdAt: new Date('2026-11-10T00:00:00Z'),
  ...overrides,
});
const single = { type: 'GRANT' as const, beneficiaryEmployeeId: 'emp-1', withdrawing: false };

describe('executionOf: the grant task a row of the queue shows', () => {
  it('is null while nobody has made a task for the person', () => {
    expect(executionOf(single, [])).toBeNull();
  });

  it('shows the task with what may be done to it', () => {
    expect(executionOf(single, [task({})])).toEqual({
      taskId: 'task-1',
      status: 'IN_PROGRESS',
      failureReason: null,
      availableActions: ['COMPLETE', 'REPORT_FAILURE'],
    });
  });

  it('takes the newest task when a request has had more than one', () => {
    const newest = task({ taskId: 'task-2', status: 'COMPLETED' });

    expect(executionOf(single, [newest, task({ status: 'CLOSED_FAILED' })])).toMatchObject({
      taskId: 'task-2',
      availableActions: [],
    });
  });

  it('takes, for a request for a group, only the task whose seat is the person of the row', () => {
    const group = { type: 'GROUP_GRANT' as const, beneficiaryEmployeeId: 'emp-2', withdrawing: false };
    const tasks = [task({ taskId: 'of-1', employeeId: 'emp-1' }), task({ taskId: 'of-2', employeeId: 'emp-2' })];

    expect(executionOf(group, tasks)?.taskId).toBe('of-2');
    expect(executionOf({ ...group, beneficiaryEmployeeId: 'emp-3' }, tasks)).toBeNull();
  });

  it('takes the task of a service account whoever holds it, since the IT Admin may name another person than the request', () => {
    const service = { type: 'SERVICE_ACCOUNT' as const, beneficiaryEmployeeId: 'emp-1', withdrawing: false };

    expect(executionOf(service, [task({ employeeId: 'someone-else' })])?.taskId).toBe('task-1');
  });

  it('leaves the cancellation alone on a failed task of a withdrawn request', () => {
    const failed = task({ status: 'FAILED', failureReason: 'Seat refused' });

    expect(executionOf({ ...single, withdrawing: true }, [failed])).toMatchObject({
      failureReason: 'Seat refused',
      availableActions: ['CANCEL'],
    });
    expect(executionOf(single, [failed])?.availableActions).toEqual(['RETRY', 'CLOSE_FAILED']);
  });
});
