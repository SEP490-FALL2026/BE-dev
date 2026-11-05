import { addsToolStatusWithoutReacknowledgement } from './notice.policy';

describe('addsToolStatusWithoutReacknowledgement', () => {
  it('refuses a version that adds the status of tools and keeps the acknowledgements', () => {
    expect(
      addsToolStatusWithoutReacknowledgement(
        { includesToolStatus: false },
        { includesToolStatus: true, requiresReacknowledgement: false },
      ),
    ).toBe(true);
  });

  it('accepts it when the holders are asked again, when it was already collected and for the first version', () => {
    expect(
      addsToolStatusWithoutReacknowledgement(
        { includesToolStatus: false },
        { includesToolStatus: true, requiresReacknowledgement: true },
      ),
    ).toBe(false);
    expect(
      addsToolStatusWithoutReacknowledgement(
        { includesToolStatus: true },
        { includesToolStatus: true, requiresReacknowledgement: false },
      ),
    ).toBe(false);
    expect(
      addsToolStatusWithoutReacknowledgement(null, { includesToolStatus: true, requiresReacknowledgement: false }),
    ).toBe(false);
  });
});
