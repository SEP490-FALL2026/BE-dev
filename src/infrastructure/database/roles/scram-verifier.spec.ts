import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { scramSha256Verifier } from './scram-verifier';

/** RFC 7677 §3: the SCRAM-SHA-256 exchange for the password "pencil". */
const RFC7677 = {
  password: 'pencil',
  salt: 'W22ZaJ0SNY7soEsUEjb6gQ==',
  iterations: 4096,
  authMessage:
    'n=user,r=rOprNGfwEbeRWgbNEkqO,' +
    'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,' +
    'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0',
  clientProof: 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=',
  serverSignature: '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=',
};

function parse(verifier: string): { iterations: number; salt: Buffer; storedKey: Buffer; serverKey: Buffer } {
  const match = /^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/.exec(verifier);
  if (!match) throw new Error('not a PostgreSQL SCRAM-SHA-256 verifier');
  return {
    iterations: Number(match[1]),
    salt: Buffer.from(match[2], 'base64'),
    storedKey: Buffer.from(match[3], 'base64'),
    serverKey: Buffer.from(match[4], 'base64'),
  };
}

describe('scramSha256Verifier', () => {
  it('is the verifier PostgreSQL stores: it proves the RFC 7677 exchange', () => {
    const { storedKey, serverKey } = parse(
      scramSha256Verifier(RFC7677.password, Buffer.from(RFC7677.salt, 'base64'), RFC7677.iterations),
    );
    const serverSignature = createHmac('sha256', serverKey).update(RFC7677.authMessage).digest('base64');
    // The client proof XOR its signature gives the client key, whose hash is the stored key.
    const clientSignature = createHmac('sha256', storedKey).update(RFC7677.authMessage).digest();
    const proof = Buffer.from(RFC7677.clientProof, 'base64');
    const clientKey = Buffer.from(proof.map((byte, index) => byte ^ clientSignature[index]));

    expect(serverSignature).toBe(RFC7677.serverSignature);
    expect(createHash('sha256').update(clientKey).digest().equals(storedKey)).toBe(true);
  });

  it('uses 4096 iterations and a fresh 16-byte salt by default', () => {
    const first = parse(scramSha256Verifier('r'.repeat(40)));
    const second = parse(scramSha256Verifier('r'.repeat(40)));

    expect(first.iterations).toBe(4096);
    expect(first.salt).toHaveLength(16);
    expect(first.salt.equals(second.salt)).toBe(false);
    expect(first.storedKey.equals(second.storedKey)).toBe(false);
  });

  it('never contains the password itself', () => {
    const password = 'p'.repeat(48);
    const verifier = scramSha256Verifier(password);
    const { salt, iterations, serverKey } = parse(verifier);

    expect(verifier).not.toContain(password);
    expect(
      createHmac('sha256', pbkdf2Sync(password, salt, iterations, 32, 'sha256'))
        .update('Server Key')
        .digest()
        .equals(serverKey),
    ).toBe(true);
  });
});
