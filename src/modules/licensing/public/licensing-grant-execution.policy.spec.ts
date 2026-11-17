import { grantExecutionActions } from './licensing-grant-execution.policy';

describe('grantExecutionActions: what an IT Admin may do next on the grant task of one person', () => {
  it('lets a task nobody has taken be taken, and nothing else', () => {
    expect(grantExecutionActions({ status: 'QUEUED', channel: 'MANUAL' }, false)).toEqual(['CLAIM']);
  });

  it('lets the task in progress be completed or reported as not done', () => {
    expect(grantExecutionActions({ status: 'IN_PROGRESS', channel: 'MANUAL' }, false)).toEqual([
      'COMPLETE',
      'REPORT_FAILURE',
    ]);
  });

  it('offers the three decisions on a failed connector task and two on a failed manual one (a manual task cannot be handed off)', () => {
    expect(grantExecutionActions({ status: 'FAILED', channel: 'CONNECTOR' }, false)).toEqual([
      'RETRY',
      'HAND_OFF',
      'CLOSE_FAILED',
    ]);
    expect(grantExecutionActions({ status: 'FAILED', channel: 'MANUAL' }, false)).toEqual(['RETRY', 'CLOSE_FAILED']);
  });

  it('leaves only the cancellation on a failed task whose request the requester withdrew', () => {
    expect(grantExecutionActions({ status: 'FAILED', channel: 'MANUAL' }, true)).toEqual(['CANCEL']);
    expect(grantExecutionActions({ status: 'FAILED', channel: 'CONNECTOR' }, true)).toEqual(['CANCEL']);
  });

  it('offers nothing to a connector task that works by itself, a task waiting for its retry or one that is over', () => {
    expect(grantExecutionActions({ status: 'QUEUED', channel: 'CONNECTOR' }, false)).toEqual([]);
    expect(grantExecutionActions({ status: 'IN_PROGRESS', channel: 'CONNECTOR' }, false)).toEqual([]);
    expect(grantExecutionActions({ status: 'RETRY_SCHEDULED', channel: 'MANUAL' }, false)).toEqual([]);
    expect(grantExecutionActions({ status: 'COMPLETED', channel: 'MANUAL' }, false)).toEqual([]);
    expect(grantExecutionActions({ status: 'CLOSED_FAILED', channel: 'MANUAL' }, false)).toEqual([]);
    expect(grantExecutionActions({ status: 'CANCELLED', channel: 'MANUAL' }, false)).toEqual([]);
  });

  it('does not change what a task in progress offers when the request is being withdrawn (the withdrawal only waits for a failed task)', () => {
    expect(grantExecutionActions({ status: 'IN_PROGRESS', channel: 'MANUAL' }, true)).toEqual([
      'COMPLETE',
      'REPORT_FAILURE',
    ]);
  });
});
