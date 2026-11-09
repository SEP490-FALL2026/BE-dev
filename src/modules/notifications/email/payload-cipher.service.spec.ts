import { randomBytes } from 'node:crypto';
import { PayloadDecryptionError } from '../notifications.errors';
import { PayloadCipher } from './payload-cipher.service';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

describe('PayloadCipher', () => {
  const cipher = new PayloadCipher({ currentKeyId: 'k1', keys: { k1: KEY_A, k0: KEY_B } });
  const rowId = '11111111-1111-4111-8111-111111111111';

  it('round-trips a payload and never stores it in the clear', () => {
    const sealed = cipher.encrypt(rowId, { token: 'secret-token-value', expiresAt: '2026-10-15T00:00:00.000Z' });

    expect(sealed.keyId).toBe('k1');
    expect(sealed.ciphertext.toString('utf8')).not.toContain('secret-token-value');
    expect(cipher.decrypt(rowId, sealed.keyId, sealed.ciphertext)).toEqual({
      token: 'secret-token-value',
      expiresAt: '2026-10-15T00:00:00.000Z',
    });
  });

  it('refuses a ciphertext moved to another outbox row (the row id is authenticated)', () => {
    const sealed = cipher.encrypt(rowId, { token: 't' });

    expect(() => cipher.decrypt('22222222-2222-4222-8222-222222222222', sealed.keyId, sealed.ciphertext)).toThrow(
      PayloadDecryptionError,
    );
  });

  it('refuses a tampered ciphertext', () => {
    const sealed = cipher.encrypt(rowId, { token: 't' });
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[tampered.length - 1] ^= 0xff;

    expect(() => cipher.decrypt(rowId, sealed.keyId, tampered)).toThrow(PayloadDecryptionError);
  });

  it('reads a row sealed with an older key that is still configured, and refuses an unknown key id', () => {
    const old = new PayloadCipher({ currentKeyId: 'k0', keys: { k0: KEY_B } }).encrypt(rowId, { token: 't' });

    expect(cipher.decrypt(rowId, old.keyId, old.ciphertext)).toEqual({ token: 't' });
    expect(() => cipher.decrypt(rowId, 'gone', old.ciphertext)).toThrow(PayloadDecryptionError);
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(
      () => new PayloadCipher({ currentKeyId: 'k', keys: { k: Buffer.from('short').toString('base64') } }),
    ).toThrow(/32 bytes/);
  });
});
