import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export class LicenseKeyDecryptionError extends Error {
  constructor() {
    super('A license key could not be decrypted.');
    this.name = 'LicenseKeyDecryptionError';
  }
}

export interface LicenseKeyCipherConfig {
  currentKeyId: string;
  /** Key id -> base64 of 32 bytes. An older key stays until no license key is sealed with it. */
  keys: Record<string, string>;
  /** The stable secret of the fingerprints: it never rotates with the encryption key, or duplicates would go unseen. */
  fingerprintPepper: string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_PEPPER_LENGTH = 16;

/**
 * The cipher of license keys at rest (`QĐ-54b`): AES-256-GCM, layout iv (12) | auth tag (16) | ciphertext. The row id and
 * the key id are authenticated data, so a ciphertext copied to another row, or relabelled with another key id, does not
 * open. It also gives the fingerprint that tells two equal keys apart from two different ones without opening anything:
 * the HMAC of the key with a stable pepper. No message of a failure ever holds a key or a secret.
 */
export class LicenseKeyCipher {
  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly config: LicenseKeyCipherConfig) {
    for (const [id, encoded] of Object.entries(config.keys)) {
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) throw new Error(`License key vault key "${id}" must be 32 bytes (base64).`);
      this.keys.set(id, key);
    }
    if (!this.keys.has(config.currentKeyId)) {
      throw new Error(`License key vault key "${config.currentKeyId}" is not configured.`);
    }
    if (config.fingerprintPepper.length < MIN_PEPPER_LENGTH) {
      throw new Error(`The license key fingerprint pepper must be at least ${MIN_PEPPER_LENGTH} characters.`);
    }
  }

  encrypt(rowId: string, licenseKey: string): { keyId: string; ciphertext: Buffer } {
    const keyId = this.config.currentKeyId;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(keyId) as Buffer, iv);
    cipher.setAAD(this.aad(rowId, keyId));
    const body = Buffer.concat([cipher.update(licenseKey, 'utf8'), cipher.final()]);

    return { keyId, ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]) };
  }

  /** Throws LicenseKeyDecryptionError for an unknown key id, a ciphertext of another row, or one that was touched. */
  decrypt(rowId: string, keyId: string, ciphertext: Buffer): string {
    const key = this.keys.get(keyId);
    if (!key || ciphertext.length < IV_BYTES + TAG_BYTES) throw new LicenseKeyDecryptionError();

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(0, IV_BYTES));
      decipher.setAAD(this.aad(rowId, keyId));
      decipher.setAuthTag(ciphertext.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));

      return Buffer.concat([decipher.update(ciphertext.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      throw new LicenseKeyDecryptionError();
    }
  }

  /** Hex HMAC-SHA256 of the key: equal for equal keys, unrelated for others, and no way back to the key. */
  fingerprint(licenseKey: string): string {
    return createHmac('sha256', this.config.fingerprintPepper).update(licenseKey, 'utf8').digest('hex');
  }

  private aad(rowId: string, keyId: string): Buffer {
    return Buffer.from(`license-key|${rowId}|${keyId}`, 'utf8');
  }
}

/** The keys that may still open what was sealed before a rotation: `id:base64` pairs separated by commas. */
export function parsePreviousVaultKeys(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf(':');
        if (separator < 1 || separator === pair.length - 1) {
          throw new Error('LICENSE_KEY_VAULT_PREVIOUS_KEYS must hold id:base64 pairs separated by commas.');
        }

        return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
      }),
  );
}
