import { shouldConvertOneStep } from './one-step-conversion.policy';
describe('BR-MF1-02: convert existing paid requests after a head leaves', () => {
  const facts = { paid: true, mode: 'VIA_HEAD', state: 'PENDING', hasHead: false, successorRecorded: false };
  it.each(['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'])('marks a paid request at the head (%s)', (state) => expect(shouldConvertOneStep({ ...facts, state })).toBe(true));
  it('Q-25: keeps an existing request waiting for the recorded successor', () => expect(shouldConvertOneStep({ ...facts, successorRecorded: true })).toBe(false));
  it('Q-33: keeps internal requests waiting', () => expect(shouldConvertOneStep({ ...facts, paid: false })).toBe(false));
  it.each(['AWAITING_SPEND_DECISION', 'REJECTED', 'COMPLETED', 'AWAITING_REQUESTER_REVISION'])('does not mark %s', (state) => expect(shouldConvertOneStep({ ...facts, state })).toBe(false));
});
