import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { NoTerminalError, PromptCancelledError, TtyInput, readHiddenLine } from './hidden-prompt';

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
