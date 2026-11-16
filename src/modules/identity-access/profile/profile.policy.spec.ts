import { AVATAR_MAX_BYTES, avatarKindOf, avatarObjectKey, judgeAvatar, normalizeWorkPhone } from './profile.policy';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20]);

describe('avatarKindOf (the signature of the file, QĐ-111at)', () => {
  it('knows png, jpeg and webp by their first bytes', () => {
    expect(avatarKindOf(PNG)).toEqual({ extension: 'png', contentType: 'image/png' });
    expect(avatarKindOf(JPEG)).toEqual({ extension: 'jpg', contentType: 'image/jpeg' });
    expect(avatarKindOf(WEBP)).toEqual({ extension: 'webp', contentType: 'image/webp' });
  });

  it('knows nothing else: a gif, another RIFF file, text, an empty file', () => {
    expect(avatarKindOf(GIF)).toBeNull();
    expect(avatarKindOf(WAV)).toBeNull();
    expect(avatarKindOf(Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(avatarKindOf(new Uint8Array(0))).toBeNull();
  });

  it('does not take a short file that only starts like one', () => {
    expect(avatarKindOf(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(avatarKindOf(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('judgeAvatar', () => {
  it('accepts a file of a known signature whose declared type is the one it really is', () => {
    expect(judgeAvatar({ bytes: PNG, declaredContentType: 'image/png' })).toEqual({
      ok: true,
      kind: { extension: 'png', contentType: 'image/png' },
    });
  });

  it('accepts exactly one megabyte and refuses one byte more with TOO_LARGE', () => {
    const exactly = new Uint8Array(AVATAR_MAX_BYTES);
    exactly.set(PNG);
    const more = new Uint8Array(AVATAR_MAX_BYTES + 1);
    more.set(PNG);

    expect(judgeAvatar({ bytes: exactly, declaredContentType: 'image/png' }).ok).toBe(true);
    expect(judgeAvatar({ bytes: more, declaredContentType: 'image/png' })).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('refuses a type that is not png, jpeg or webp with UNSUPPORTED_TYPE, whatever it declares', () => {
    expect(judgeAvatar({ bytes: GIF, declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
    });
    expect(judgeAvatar({ bytes: GIF, declaredContentType: 'image/gif' })).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_TYPE',
    });
  });

  it('refuses a file that is not what it says with TYPE_MISMATCH', () => {
    expect(judgeAvatar({ bytes: JPEG, declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'TYPE_MISMATCH',
    });
  });

  it('refuses an empty file with EMPTY', () => {
    expect(judgeAvatar({ bytes: new Uint8Array(0), declaredContentType: 'image/png' })).toEqual({
      ok: false,
      reason: 'EMPTY',
    });
  });
});

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
