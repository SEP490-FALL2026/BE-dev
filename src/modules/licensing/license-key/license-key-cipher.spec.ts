import { LicenseKeyCipher, LicenseKeyDecryptionError, parsePreviousVaultKeys } from './license-key-cipher';

const b64 = (byte: number) => Buffer.alloc(32, byte).toString('base64');
const PEPPER = 'a-stable-pepper-for-the-fingerprints';
const cipher = (over: Partial<ConstructorParameters<typeof LicenseKeyCipher>[0]> = {}) =>
  new LicenseKeyCipher({ currentKeyId: 'k1', keys: { k1: b64(1) }, fingerprintPepper: PEPPER, ...over });
const SECRET = 'OFFICE-2021-XXXXX-12345-ABCDE';

describe('the cipher of license keys at rest (QĐ-54b, US-04-12 AC-2)', () => {
  it('seals a key so that it opens again for the row and the key id it was sealed for', () => {
    const sealed = cipher().encrypt('row-1', SECRET);

    expect(sealed.keyId).toBe('k1');
    expect(cipher().decrypt('row-1', sealed.keyId, sealed.ciphertext)).toBe(SECRET);
  });

  it('never holds the key in the clear, and seals the same key differently each time', () => {
    const first = cipher().encrypt('row-1', SECRET);
    const second = cipher().encrypt('row-1', SECRET);

    expect(first.ciphertext.toString('utf8')).not.toContain('OFFICE');
    expect(first.ciphertext.includes(Buffer.from(SECRET))).toBe(false);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('does not open a sealed key copied to another row, relabelled with another key id, or touched', () => {
    const both = cipher({ keys: { k1: b64(1), k2: b64(1) } });
    const sealed = both.encrypt('row-1', SECRET);
    const touched = Buffer.from(sealed.ciphertext);
    touched[touched.length - 1] ^= 0x01;

    expect(() => both.decrypt('row-2', 'k1', sealed.ciphertext)).toThrow(LicenseKeyDecryptionError);
    expect(() => both.decrypt('row-1', 'k2', sealed.ciphertext)).toThrow(LicenseKeyDecryptionError);
    expect(() => both.decrypt('row-1', 'k1', touched)).toThrow(LicenseKeyDecryptionError);
    expect(() => both.decrypt('row-1', 'k1', Buffer.alloc(5))).toThrow(LicenseKeyDecryptionError);
  });

  it('opens a key sealed with an older key that is still configured, and not one whose key was dropped', () => {
    const old = cipher({ currentKeyId: 'old', keys: { old: b64(7) } });
    const sealed = old.encrypt('row-1', SECRET);
    const rotated = cipher({ currentKeyId: 'new', keys: { new: b64(9), old: b64(7) } });

    expect(rotated.decrypt('row-1', 'old', sealed.ciphertext)).toBe(SECRET);
    expect(rotated.encrypt('row-2', SECRET).keyId).toBe('new');
    expect(() =>
      cipher({ currentKeyId: 'new', keys: { new: b64(9) } }).decrypt('row-1', 'old', sealed.ciphertext),
    ).toThrow(LicenseKeyDecryptionError);
  });

  it('refuses a configuration with a key that is not 32 bytes, a current key that is missing, or a weak pepper', () => {
    expect(() => cipher({ keys: { k1: Buffer.alloc(16).toString('base64') } })).toThrow(/32 bytes/);
    expect(() => cipher({ currentKeyId: 'missing' })).toThrow(/not configured/);
    expect(() => cipher({ fingerprintPepper: 'short' })).toThrow(/pepper/);
  });

  it('never puts the key or the secret in the message of a failure', () => {
    const sealed = cipher().encrypt('row-1', SECRET);

    try {
      cipher().decrypt('row-2', 'k1', sealed.ciphertext);
      throw new Error('should have failed');
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).not.toContain(b64(1));
    }
  });
});

describe('the fingerprint of a license key (US-04-12 AC-9)', () => {
  it('is the same for the same key and different for another, and tells nothing of the key', () => {
    const one = cipher().fingerprint(SECRET);

    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(cipher().fingerprint(SECRET)).toBe(one);
    expect(cipher().fingerprint(`${SECRET}X`)).not.toBe(one);
    expect(cipher().fingerprint(SECRET.toLowerCase())).not.toBe(one);
    expect(one).not.toContain(SECRET.slice(0, 8));
  });

  it('does not move when the encryption key is rotated, only when the pepper does', () => {
    const before = cipher().fingerprint(SECRET);

    expect(cipher({ currentKeyId: 'k2', keys: { k2: b64(2), k1: b64(1) } }).fingerprint(SECRET)).toBe(before);
    expect(cipher({ fingerprintPepper: 'another-stable-pepper-for-the-test' }).fingerprint(SECRET)).not.toBe(before);
  });
});

describe('the keys that may still open what was sealed before a rotation', () => {
  it('are read as id:base64 pairs separated by commas', () => {
    expect(parsePreviousVaultKeys(`old:${b64(3)}, older:${b64(4)}`)).toEqual({ old: b64(3), older: b64(4) });
    expect(parsePreviousVaultKeys('')).toEqual({});
    expect(parsePreviousVaultKeys('  ')).toEqual({});
  });

  it('refuse a pair with no key or no id, which would silently drop a key', () => {
    expect(() => parsePreviousVaultKeys('old')).toThrow(/id:base64/);
    expect(() => parsePreviousVaultKeys(`:${b64(3)}`)).toThrow(/id:base64/);
    expect(() => parsePreviousVaultKeys('old:')).toThrow(/id:base64/);
  });
});
