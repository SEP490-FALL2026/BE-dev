import { checkPasswordPolicy } from '../../modules/identity-access/public/password.policy';
import { INSTALLATION } from './fixture/shared-demo-v3/installation';
import type { Readable } from 'node:stream';

/**
 * The two passwords of `ops:seed --secrets-stdin`, read from standard input only (never an argument, an environment
 * variable or a file the command opens): the Super Admin's, to sign in and drive the API as the role the business rules
 * name, and the one every demo account gets. The operator wrapper writes them from its private file through a pipe.
 */
export interface DemoSecrets {
  superAdminPassword: string;
  demoAccountPassword: string;
}

export class DemoSecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSecretsError';
  }
}

export interface DemoSecretsInput extends Readable {
  isTTY?: boolean;
}

/** Two `NAME=value` lines; a password is at most 128 characters (4 bytes each in UTF-8) plus its name. */
export const DEMO_SECRETS_MAX_BYTES = 2048;
export const DEMO_SECRETS_TIMEOUT_MS = 10_000;

/** The name of each line and the field it fills (pairs, not an object: no literal reads like a password value). */
const NAMES = new Map<string, keyof DemoSecrets>([
  ['SUPER_ADMIN_PASSWORD', 'superAdminPassword'],
  ['DEMO_ACCOUNT_PASSWORD', 'demoAccountPassword'],
]);
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** One `NAME=value` line into `found`; the value is everything after the first `=`, as written. */
function readLine(line: string, found: Partial<Record<keyof DemoSecrets, string>>): void {
  const at = line.indexOf('=');
  const name = at < 0 ? '' : line.slice(0, at);
  const key = NAMES.get(name);
  if (key === undefined) {
    throw new DemoSecretsError('Each line must be SUPER_ADMIN_PASSWORD=… or DEMO_ACCOUNT_PASSWORD=….');
  }
  const value = line.slice(at + 1);
  if (found[key] !== undefined) throw new DemoSecretsError(`${name} is given twice.`);
  if (value.length === 0 || hasControlCharacter(value)) {
    throw new DemoSecretsError(`${name} is empty or has a control character.`);
  }
  found[key] = value;
}

/** Judges the whole record. Every refusal names the problem, never a byte of a value. */
export function parseDemoSecrets(record: Buffer): DemoSecrets {
  if (record.length === 0 || record[record.length - 1] !== 0x0a) {
    throw new DemoSecretsError(
      'The secrets record must end with a line feed (it may have been cut short); nothing was used.',
    );
  }
  let text: string;
  try {
    text = UTF8.decode(record.subarray(0, record.length - 1));
  } catch {
    throw new DemoSecretsError('The secrets record is not valid UTF-8.');
  }
  if (text.includes('\r'))
    throw new DemoSecretsError('The secrets record has a carriage return (CRLF); send bare line feeds.');
  const found: Partial<Record<keyof DemoSecrets, string>> = {};
  for (const line of text.split('\n')) readLine(line, found);
  if (found.superAdminPassword === undefined || found.demoAccountPassword === undefined) {
    throw new DemoSecretsError('Both SUPER_ADMIN_PASSWORD and DEMO_ACCOUNT_PASSWORD are required.');
  }

  return { superAdminPassword: found.superAdminPassword, demoAccountPassword: found.demoAccountPassword };
}

/** Reads the record to its end, bounded in size and time; a terminal is refused (what is typed would be echoed). */
export function readDemoSecrets(
  input: DemoSecretsInput,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<DemoSecrets> {
  if (input.isTTY) {
    return Promise.reject(
      new DemoSecretsError('Standard input is a terminal: --secrets-stdin reads a pipe (the wrapper script).'),
    );
  }
  const maxBytes = options.maxBytes ?? DEMO_SECRETS_MAX_BYTES;

  return new Promise<DemoSecrets>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const finish = (outcome: () => void): void => {
      clearTimeout(timer);
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      input.pause();
      outcome();
    };
    const refuse = (message: string): void => finish(() => reject(new DemoSecretsError(message)));
    const onError = (): void => refuse('Could not read the secrets record from standard input.');
    const onData = (chunk: Buffer | string): void => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      received += bytes.length;
      if (received > maxBytes) return refuse(`The secrets record is too long (at most ${maxBytes} bytes).`);
      chunks.push(bytes);
    };
    const onEnd = (): void => {
      try {
        const secrets = parseDemoSecrets(Buffer.concat(chunks, received));
        finish(() => resolve(secrets));
      } catch (error) {
        const refusal = error instanceof Error ? error : new DemoSecretsError('The secrets record was refused.');
        finish(() => reject(refusal));
      }
    };
    const timer = setTimeout(
      () => refuse('Timed out waiting for the secrets record on standard input.'),
      options.timeoutMs ?? DEMO_SECRETS_TIMEOUT_MS,
    );
    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
    input.resume();
  });
}

/** No hashing or database access: both passwords must pass before starting any graph. */
export function seedSecretsProblem(
  secrets: DemoSecrets,
  superAdminEmail: string = INSTALLATION.loginEmail,
): string | null {
  const problem = checkPasswordPolicy(secrets.superAdminPassword, superAdminEmail);
  if (problem) return problem;
  const length = [...secrets.demoAccountPassword].length;
  return length < 12 || length > 128 ? 'DEMO_LENGTH' : null;
}
