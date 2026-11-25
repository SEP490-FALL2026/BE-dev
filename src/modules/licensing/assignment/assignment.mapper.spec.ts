import { assignmentSchema } from './assignment.dto';
import { toAssignmentWire } from './assignment.mapper';
import type { AssignmentView } from '../public/licensing.types';

describe('an assignment as the wire carries it', () => {
  const view = {
    id: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
    failedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-11-25T01:00:00.000Z'),
    personalCommitmentMonths: 12,
    billingAnchorOn: '2026-11-01',
  } as unknown as AssignmentView;

  it('keeps the term and the anchor of a personal right for the rules and never sends them (the schema of the response is strict)', () => {
    const wire = toAssignmentWire(view);

    expect(wire).not.toHaveProperty('personalCommitmentMonths');
    expect(wire).not.toHaveProperty('billingAnchorOn');
    expect(wire.createdAt).toBe('2026-11-25T01:00:00.000Z');
    expect(view.personalCommitmentMonths).toBe(12);
    expect(Object.keys(wire).filter((key) => !(key in assignmentSchema.shape))).toEqual([]);
  });
});
