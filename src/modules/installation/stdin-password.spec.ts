import { PassThrough } from 'node:stream';
import { StdinPasswordError } from './installation.errors';
import { STDIN_PASSWORD_MAX_BYTES, readPasswordRecord } from './stdin-password';

/** A fake canary, not a credential: it must never appear in an error, a log line or an echo. */
const CANARY = 'canary-Pw 9f3aé';

type Pipe = PassThrough & { isTTY?: boolean };

const pipe = (): Pipe => new PassThrough();

/** Writes the chunks and ends the stream, once the reader has attached. */
function feed(stream: Pipe, ...chunks: (string | Buffer)[]): void {
  setImmediate(() => {
    for (const chunk of chunks) stream.write(chunk);
    stream.end();
  });
}

const refusal = async (promise: Promise<string>): Promise<StdinPasswordError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StdinPasswordError);
    return error as StdinPasswordError;
  }
  throw new Error('expected the record to be refused');
};

describe('readPasswordRecord (the bounded stdin transport of the Super Admin password)', () => {
  describe('accepts exactly one record: the password, one line feed, end of input', () => {
    it('removes only the one transport line feed', async () => {
      const stream = pipe();
      feed(stream, 'correct horse staple\n');

      await expect(readPasswordRecord(stream)).resolves.toBe('correct horse staple');
    });

    it('preserves leading and trailing spaces and a literal backslash-n', async () => {
      const stream = pipe();
      feed(stream, '  two spaces around \\n kept  \n');

      await expect(readPasswordRecord(stream)).resolves.toBe('  two spaces around \\n kept  ');
    });

    it('preserves non-ASCII text, also when a multi-byte character is split across chunks', async () => {
      const bytes = Buffer.from('mật khẩu ✓ 密码 😀\n', 'utf8');
      const stream = pipe();
      // Cuts inside the 3-byte characters and inside the 4-byte emoji.
      feed(
        stream,
        bytes.subarray(0, 3),
        bytes.subarray(3, 14),
        bytes.subarray(14, bytes.length - 2),
        bytes.subarray(-2),
      );

      await expect(readPasswordRecord(stream)).resolves.toBe('mật khẩu ✓ 密码 😀');
    });

    it('accepts the longest password the policy allows (128 four-byte characters) and refuses a record over the bound', async () => {
      const longest = '😀'.repeat(128);
      expect(Buffer.byteLength(`${longest}\n`)).toBeLessThanOrEqual(STDIN_PASSWORD_MAX_BYTES);
      const ok = pipe();
      feed(ok, `${longest}\n`);
      await expect(readPasswordRecord(ok)).resolves.toBe(longest);

      const over = pipe();
      feed(over, `${'a'.repeat(STDIN_PASSWORD_MAX_BYTES)}\n`);
      expect((await refusal(readPasswordRecord(over))).message).toMatch(/too long/i);
    });
  });

  describe('refuses anything that is not that one record, and says why without echoing a byte of it', () => {
    const malformed: [string, Buffer | string, RegExp][] = [
      ['an empty record', '\n', /empty/i],
      ['no input at all', '', /no password/i],
      ['no line feed at the end (a truncated write would otherwise become a different password)', CANARY, /line feed/i],
      [
        'a CRLF ending (the carriage return is neither password nor silently dropped)',
        `${CANARY}\r\n`,
        /carriage return/i,
      ],
      ['a second line', `${CANARY}\nsecond\n`, /one line/i],
      ['a trailing empty line', `${CANARY}\n\n`, /one line/i],
      ['a tab inside', `${CANARY}\tx\n`, /control character/i],
      ['a NUL byte', Buffer.from(`${CANARY}\u0000x\n`, 'utf8'), /control character/i],
      ['an escape character', `${CANARY}\u001bx\n`, /control character/i],
      ['a DEL character', `${CANARY}\u007fx\n`, /control character/i],
      ['invalid UTF-8', Buffer.from([0x61, 0xff, 0xfe, 0x62, 0x0a]), /UTF-8/],
    ];

    it.each(malformed)('%s', async (_name, input, pattern) => {
      const stream = pipe();
      feed(stream, input);

      const error = await refusal(readPasswordRecord(stream));

      expect(error.message).toMatch(pattern);
      expect(error.message).not.toContain('canary');
      expect(JSON.stringify(error)).not.toContain('canary');
      expect(String(error.stack)).not.toContain('canary');
    });

    it('stops reading an oversized record at once, without waiting for the end of input', async () => {
      const stream = pipe();
      stream.write(CANARY.repeat(4)); // more than 16 bytes; end() is never called

      const error = await refusal(readPasswordRecord(stream, { maxBytes: 16, timeoutMs: 5000 }));

      expect(error.message).toMatch(/too long/i);
      expect(error.message).toContain('16');
      expect(error.message).not.toContain('canary');
      expect(stream.listenerCount('data')).toBe(0);
    });
  });

  describe('refuses to read where it cannot be a transport', () => {
    it('refuses a terminal, so a typed password is never echoed by this mode, and does not start reading', async () => {
      const stream = pipe();
      stream.isTTY = true;

      const error = await refusal(readPasswordRecord(stream));

      expect(error.message).toMatch(/terminal/i);
      expect(error.message).toMatch(/hidden prompt/i);
      expect(stream.listenerCount('data')).toBe(0);
      expect(stream.readableFlowing).toBeNull();
    });

    it('gives up when nothing arrives and the input is not closed within the time limit', async () => {
      const stream = pipe(); // never written, never ended

      const error = await refusal(readPasswordRecord(stream, { timeoutMs: 25 }));

      expect(error.message).toMatch(/timed out/i);
      expect(stream.listenerCount('data')).toBe(0);
    });

    it('gives up when a record starts but the input is never closed, without echoing the part it has', async () => {
      const stream = pipe();
      stream.write('half-written-canary');

      const error = await refusal(readPasswordRecord(stream, { timeoutMs: 25 }));

      expect(error.message).toMatch(/timed out/i);
      expect(error.message).not.toContain('canary');
    });

    it('reports a read error without the system message, which can carry paths or values', async () => {
      const stream = pipe();
      setImmediate(() => stream.destroy(new Error(`EIO ${CANARY}`)));

      const error = await refusal(readPasswordRecord(stream));

      expect(error.message).toMatch(/could not read/i);
      expect(error.message).not.toContain('canary');
    });
  });

  it('removes its listeners and pauses the input once it has the record', async () => {
    const stream = pipe();
    feed(stream, 'a-password-of-12-chars\n');

    await readPasswordRecord(stream);

    expect(stream.listenerCount('data')).toBe(0);
    expect(stream.listenerCount('end')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.isPaused()).toBe(true);
  });

  it('leaves no timer behind once the record is read', async () => {
    const stream = pipe();
    feed(stream, 'a-password-of-12-chars\n');
    const timers = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
    const before = timers();

    await readPasswordRecord(stream, { timeoutMs: 60_000 });

    expect(timers()).toBeLessThanOrEqual(before);
  });
});
