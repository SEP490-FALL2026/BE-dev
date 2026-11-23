import { avatarObjectKey, normalizeWorkPhone } from './profile.policy';

describe('avatarObjectKey', () => {
  it('names the organization, the account and a token, so a new picture is a new key', () => {
    expect(avatarObjectKey('org-1', 'user-1', 'abc123', 'webp')).toBe('avatars/org-1/user-1/abc123.webp');
  });
});

describe('normalizeWorkPhone (R-22)', () => {
  it.each([
    ['0901234567', '0901234567'],
    ['+84901234567', '+84901234567'],
    ['  +84 90 123 4567 ', '+84901234567'],
    ['090.123.4567', '0901234567'],
    ['090-123-4567', '0901234567'],
  ])('takes %s as %s', (raw, value) => {
    expect(normalizeWorkPhone(raw)).toEqual({ ok: true, value });
  });

  it.each([[null], [''], ['   ']])('reads %j as clearing the number', (raw) => {
    expect(normalizeWorkPhone(raw)).toEqual({ ok: true, value: null });
  });

  it.each([['abc'], ['090123'], ['+84 (901) 234 567'], ['0901234567890123'], ['++84901234567'], ['84+901234567']])(
    'refuses %s',
    (raw) => {
      expect(normalizeWorkPhone(raw)).toEqual({ ok: false });
    },
  );
});
