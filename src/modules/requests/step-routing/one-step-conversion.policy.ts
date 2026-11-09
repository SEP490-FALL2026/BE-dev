/** Only paid requests at their head convert; an already recorded successor keeps existing requests waiting. */
export function shouldConvertOneStep(facts: { paid: boolean; mode: string; state: string; hasHead: boolean; successorRecorded: boolean }): boolean {
  return facts.paid && facts.mode === 'VIA_HEAD' && !facts.hasHead && !facts.successorRecorded &&
    ['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'].includes(facts.state);
}
