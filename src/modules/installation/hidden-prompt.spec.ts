import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import {
  NoTerminalError,
  PasswordMismatchError,
  PromptCancelledError,
  TtyInput,
  readHiddenLine,
  readSuperAdminPassword,
} from './hidden-prompt';
import { StdinPasswordError } from './installation.errors';

class FakeTty extends EventEmitter {
  isTTY = true;
  raw: boolean[] = [];
  paused = false;
  setRawMode = (mode: boolean): void => {
    this.raw.push(mode);
  };
  pause = (): this => {
    this.paused = true;
    return this;
  };
  resume = (): this => {
    this.paused = false;
    return this;
  };
}

function run(keys: string[], configure?: (tty: FakeTty) => void) {
  const tty = new FakeTty();
  configure?.(tty);
  let written = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      written += String(chunk);
      callback();
    },
  });
  const promise = readHiddenLine(tty as unknown as TtyInput, output, 'Password: ');
  for (const key of keys) tty.emit('data', Buffer.from(key));

  return { tty, promise, output: () => written };
}

describe('readHiddenLine', () => {
  it('returns what was typed on Enter and never echoes it', async () => {
    const { promise, output } = run(['s', 'e', 'c', 'r', 'e', 't', '\r']);

    await expect(promise).resolves.toBe('secret');
    expect(output()).toBe('Password: \n');
  });

  it('handles Backspace, including inside a multi-character paste', async () => {
    const { promise } = run(['abc\u007f\u007fd\r']);

    await expect(promise).resolves.toBe('ad');
  });

  it('keeps non-ASCII characters and drops other control characters', async () => {
    const { promise } = run(['mật khẩu\u001b\r']);

    await expect(promise).resolves.toBe('mật khẩu');
  });

  it('cancels on Ctrl+C and still restores the terminal', async () => {
    const { tty, promise } = run(['a', '\u0003']);

    await expect(promise).rejects.toBeInstanceOf(PromptCancelledError);
    expect(tty.raw).toEqual([true, false]);
    expect(tty.paused).toBe(true);
  });

  it('restores cooked mode after a normal read', async () => {
    const { tty, promise } = run(['x\r']);
    await promise;

    expect(tty.raw).toEqual([true, false]);
  });

  it('refuses when stdin is not a terminal', async () => {
    const tty = new FakeTty();
    tty.isTTY = false;

    await expect(readHiddenLine(tty as unknown as TtyInput, new Writable(), 'p')).rejects.toBeInstanceOf(
      NoTerminalError,
    );
  });

  it('removes its listeners when done', async () => {
    const { tty, promise } = run(['x\r']);
    await promise;

    expect(tty.listenerCount('data')).toBe(0);
  });
});

/** A fake canary, not a credential. */
const CANARY = 'canary-secret-Pw-91c4';

const capture = () => {
  let written = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      written += String(chunk);
      callback();
    },
  });
  return { output, text: () => written };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Types `lines` at the hidden prompt, one per prompt: the second prompt only attaches after the first resolves. */
async function typeAtPrompt(tty: FakeTty, ...lines: string[]): Promise<void> {
  for (const line of lines) {
    await tick();
    tty.emit('data', Buffer.from(`${line}\r`));
  }
}

describe('readSuperAdminPassword', () => {
  describe('by default: the hidden prompt, twice (unchanged behaviour)', () => {
    it('returns the password when both entries match, and prints only the labels', async () => {
      const tty = new FakeTty();
      const { output, text } = capture();

      const promise = readSuperAdminPassword({ passwordStdin: false, input: tty as unknown as TtyInput, output });
      await typeAtPrompt(tty, CANARY, CANARY);

      await expect(promise).resolves.toBe(CANARY);
      expect(text()).toBe(
        'You are creating the Super Admin account. Choose its password now.\nPassword: \nRepeat password: \n',
      );
      expect(text()).not.toContain(CANARY);
      expect(tty.raw).toEqual([true, false, true, false]);
    });

    it('refuses two different entries with the established message, and keeps neither in the message', async () => {
      const tty = new FakeTty();
      const { output } = capture();

      const promise = readSuperAdminPassword({ passwordStdin: false, input: tty as unknown as TtyInput, output });
      await typeAtPrompt(tty, CANARY, `${CANARY}-other`);

      await expect(promise).rejects.toBeInstanceOf(PasswordMismatchError);
      await expect(promise).rejects.toThrow('The two passwords do not match. Nothing was changed.');
    });

    it('cancels on Ctrl+C', async () => {
      const tty = new FakeTty();
      const { output } = capture();

      const promise = readSuperAdminPassword({ passwordStdin: false, input: tty as unknown as TtyInput, output });
      await tick();
      tty.emit('data', Buffer.from('\u0003'));

      await expect(promise).rejects.toBeInstanceOf(PromptCancelledError);
      expect(tty.raw).toEqual([true, false]);
    });

    it('does not read a pipe: without a terminal and without the switch it refuses, as before, and never consumes the pipe', async () => {
      const pipe = new PassThrough() as PassThrough & { isTTY?: boolean };
      pipe.write(`${CANARY}\n`);
      const { output, text } = capture();

      await expect(readSuperAdminPassword({ passwordStdin: false, input: pipe, output })).rejects.toBeInstanceOf(
        NoTerminalError,
      );

      expect(text()).toBe('You are creating the Super Admin account. Choose its password now.\n');
      expect(pipe.listenerCount('data')).toBe(0);
      const unread = pipe.read() as Buffer | null;
      expect(unread?.toString()).toBe(`${CANARY}\n`);
    });
  });

  describe('with passwordStdin: one record from a pipe, no prompt', () => {
    it('returns the record, prints nothing, and never touches a terminal prompt', async () => {
      const pipe = new PassThrough();
      setImmediate(() => pipe.end(`  ${CANARY} \n`));
      const { output, text } = capture();

      const password = await readSuperAdminPassword({
        passwordStdin: true,
        input: pipe,
        output,
      });

      expect(password).toBe(`  ${CANARY} `);
      expect(text()).toBe('');
    });

    it('refuses a terminal with the stdin error, not the prompt', async () => {
      const tty = new FakeTty();
      const { output, text } = capture();

      await expect(
        readSuperAdminPassword({ passwordStdin: true, input: tty as unknown as TtyInput, output }),
      ).rejects.toBeInstanceOf(StdinPasswordError);

      expect(text()).toBe('');
      expect(tty.raw).toEqual([]);
    });

    it('does not ask twice: the record is the password, there is no confirmation to mismatch', async () => {
      const pipe = new PassThrough();
      setImmediate(() => pipe.end(`${CANARY}\n`));
      const { output } = capture();

      await expect(readSuperAdminPassword({ passwordStdin: true, input: pipe, output })).resolves.toBe(CANARY);
    });

    it('passes a malformed record on as a stdin error that carries nothing of the record', async () => {
      const pipe = new PassThrough();
      setImmediate(() => pipe.end(`${CANARY}\r\n`));
      const { output, text } = capture();

      const attempt = readSuperAdminPassword({ passwordStdin: true, input: pipe, output });

      await expect(attempt).rejects.toBeInstanceOf(StdinPasswordError);
      await expect(attempt).rejects.not.toThrow(/canary/);
      expect(text()).not.toContain('canary');
    });
  });
});
