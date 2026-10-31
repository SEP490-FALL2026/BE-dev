import type { Readable } from 'node:stream';
import { StdinPasswordError } from '../../modules/installation/public/installation.errors';

/**
 * The longest record accepted, line feed included. The password policy allows 128 characters, at most 4 bytes each in
 * UTF-8 (512 bytes); the rest is slack for a transport that adds nothing, not room for a second field.
 */
export const STDIN_PASSWORD_MAX_BYTES = 1024;
/** How long the whole record may take. The writer is a pipe from the operator script: it answers at once or never. */
export const STDIN_PASSWORD_TIMEOUT_MS = 10_000;

/** The parts of a stream the reader needs; `process.stdin` satisfies it. */
export interface StdinInput extends Readable {
  isTTY?: boolean;
}

export interface PasswordRecordOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const LINE_FEED = 0x0a;

/**
 * The hidden prompt keeps only characters from space up, so a password it could not have typed — a C0 control character
 * (which includes NUL, tab and escape) or DEL — is refused here too. A code point scan, not a regular expression, so no
 * control character has to be written into the source.
 */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

type RecordVerdict = { password: string } | { refusal: string };

/**
 * Judges the whole record once the input has ended. The checks run in a fixed order and the first that fails names the
 * refusal; no refusal carries any part of the record.
 */
function judgeRecord(record: Buffer): RecordVerdict {
  if (record.length === 0) return { refusal: 'No password was received on standard input (the input ended at once).' };
  if (record[record.length - 1] !== LINE_FEED) {
    return {
      refusal:
        'The password record does not end with a line feed, so it may be cut short and nothing was used. ' +
        'Send the password followed by one line feed.',
    };
  }
  let password: string;
  try {
    password = UTF8.decode(record.subarray(0, record.length - 1));
  } catch {
    return { refusal: 'The password record is not valid UTF-8.' };
  }
  if (password.length === 0) return { refusal: 'The password record is empty.' };
  if (password.includes('\n')) {
    return { refusal: 'Standard input must carry exactly one line: the password, then one line feed.' };
  }
  if (password.includes('\r')) {
    return { refusal: 'The password record has a carriage return (CRLF line ending). Send a bare line feed.' };
  }
  if (hasControlCharacter(password)) {
    return {
      refusal: 'The password record has a control character (tab, escape, NUL or DEL), which a password cannot have.',
    };
  }

  return { password };
}

/**
 * Reads the Super Admin password for `--password-stdin`: one record, which is the password followed by one line feed,
 * then end of input. Only that line feed is removed; spaces at either end belong to the password.
 *
 * Strict on purpose. The line feed proves the writer finished (a cut-short write would otherwise become a different,
 * unknown password); end of input proves there is no second record; a carriage return is refused rather than kept or
 * dropped silently; invalid UTF-8 and control characters are refused because the prompt could not have produced them.
 * The read is bounded in size and time, stops at the first byte over the bound, and refuses a terminal, where the
 * typed password would be echoed. Errors never carry any part of the record.
 */
export function readPasswordRecord(input: StdinInput, options: PasswordRecordOptions = {}): Promise<string> {
  if (input.isTTY) {
    return Promise.reject(
      new StdinPasswordError(
        'Standard input is a terminal. --password-stdin reads one record from a pipe or a file; ' +
          'to type the password, leave the option out and use the hidden prompt.',
      ),
    );
  }
  const maxBytes = options.maxBytes ?? STDIN_PASSWORD_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? STDIN_PASSWORD_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    const finish = (outcome: () => void): void => {
      clearTimeout(timer);
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      input.off('close', onClose);
      input.pause();
      outcome();
    };
    const refuse = (message: string): void => finish(() => reject(new StdinPasswordError(message)));
    const onError = (): void => refuse('Could not read the password record from standard input.');
    const onClose = onError;
    const onData = (chunk: Buffer | string): void => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      received += bytes.length;
      if (received > maxBytes) {
        return refuse(`The password record is too long (at most ${maxBytes} bytes, line feed included).`);
      }
      chunks.push(bytes);
    };
    const onEnd = (): void => {
      const verdict = judgeRecord(Buffer.concat(chunks, received));
      if ('refusal' in verdict) return refuse(verdict.refusal);
      finish(() => resolve(verdict.password));
    };

    // Declared after the handlers that clear it; none of them can run before this line.
    const timer = setTimeout(
      () => refuse('Timed out waiting for the password record on standard input; no complete record arrived.'),
      timeoutMs,
    );
    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
    input.on('close', onClose);
    input.resume();
  });
}
