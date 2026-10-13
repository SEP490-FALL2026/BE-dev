import type { Readable, Writable } from 'node:stream';

/** The parts of a TTY stream the prompt needs; `process.stdin` satisfies it. */
export interface TtyInput extends Readable {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
}

export class NoTerminalError extends Error {
  constructor() {
    super(
      'A password can only be entered at an interactive terminal; it is never taken from arguments, the environment or a pipe.',
    );
    this.name = 'NoTerminalError';
  }
}

export class PromptCancelledError extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'PromptCancelledError';
  }
}

/**
 * Reads one line without echoing it.
 *
 * In raw mode the terminal stops processing input, so this handles Enter, Backspace and Ctrl+C
 * itself (Ctrl+C no longer raises SIGINT). Raw mode is always switched off again, including on
 * cancel and error, so a failed run does not leave the user's shell without echo. Nothing typed
 * is written back; only the label and a final newline reach the output.
 */
export function readHiddenLine(input: TtyInput, output: Writable, label: string): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(new NoTerminalError());

  return new Promise<string>((resolve, reject) => {
    let value = '';
    const setRaw = input.setRawMode?.bind(input) as (mode: boolean) => unknown;

    const finish = (outcome: () => void): void => {
      input.off('data', onData);
      input.off('error', onError);
      try {
        setRaw(false);
      } finally {
        input.pause();
        output.write('\n');
        outcome();
      }
    };
    const onError = (error: Error): void => finish(() => reject(error));
    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') return finish(() => resolve(value));
        if (char === '\u0003') return finish(() => reject(new PromptCancelledError()));
        if (char === '\u007f' || char === '\b') {
          value = [...value].slice(0, -1).join('');
        } else if (char >= ' ') {
          value += char;
        }
      }
    };

    output.write(label);
    setRaw(true);
    input.resume();
    input.on('data', onData);
    input.on('error', onError);
  });
}
