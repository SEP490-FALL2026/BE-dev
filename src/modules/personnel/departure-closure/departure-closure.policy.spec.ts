import { mailboxLockRefusal, type MailboxLockFacts } from './departure-closure.policy';

const ready: MailboxLockFacts = { closed: false, blocked: true, accountLocked: true, k1RightsOpen: 0 };

describe('the lock of the mailbox for good, item (1b) of BM-08 (QĐ-110e, B-1, P28)', () => {
  it('is allowed for a blocked person whose company account is locked and who holds no K1 without a finished revocation', () => {
    expect(mailboxLockRefusal(ready)).toBeNull();
  });

  it.each([
    ['a closed case', { closed: true }, { code: 'CASE_CLOSED' }],
    ['a person who is not blocked yet', { blocked: false }, { code: 'CASE_NOT_BLOCKED' }],
    ['a case with no lock of the company account (1a)', { accountLocked: false }, { code: 'ACCOUNT_LOCK_FIRST' }],
    [
      'a person who still holds a K1 seat whose revocation is not completed',
      { k1RightsOpen: 2 },
      { code: 'MAILBOX_LOCK_BEFORE_K1', details: { k1RightsOpen: 2 } },
    ],
  ])('is refused for %s', (_name, change, refusal) => {
    expect(mailboxLockRefusal({ ...ready, ...change })).toEqual(refusal);
  });

  it('names the first thing that is wrong, in the order a person puts it right: closed, blocked, (1a), then the K1 seats', () => {
    const everythingWrong = { closed: true, blocked: false, accountLocked: false, k1RightsOpen: 1 };

    expect(mailboxLockRefusal(everythingWrong)).toEqual({ code: 'CASE_CLOSED' });
    expect(mailboxLockRefusal({ ...everythingWrong, closed: false })).toEqual({ code: 'CASE_NOT_BLOCKED' });
    expect(mailboxLockRefusal({ ...everythingWrong, closed: false, blocked: true })).toEqual({
      code: 'ACCOUNT_LOCK_FIRST',
    });
  });
});
