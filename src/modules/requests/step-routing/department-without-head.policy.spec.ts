import { leftWithoutHead } from './department-without-head.policy';

describe('QĐ-110i: the Super Admin is told when a head period ends and nobody holds the department', () => {
  it('tells when nobody who works holds the department and no head is recorded to follow', () =>
    expect(leftWithoutHead({ headWorks: false, successorRecorded: false })).toBe(true));
  it('does not tell while a head who works still holds the department', () =>
    expect(leftWithoutHead({ headWorks: true, successorRecorded: false })).toBe(false));
  it('does not tell when a successor is recorded for a later day: the requests wait for that head, nothing is missing', () =>
    expect(leftWithoutHead({ headWorks: false, successorRecorded: true })).toBe(false));
  it('does not tell when a head works and a successor is recorded too', () =>
    expect(leftWithoutHead({ headWorks: true, successorRecorded: true })).toBe(false));
});
