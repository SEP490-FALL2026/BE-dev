import { parseArgs } from 'node:util';
import type { RecoveryContext } from './recovery.service';

export class RecoveryArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryArgumentError';
  }
}

export const RECOVERY_USAGE = `Usage: pnpm ops:recover <mode> [options]

Recovers the Super Admin role outside the application, under an approved ticket (US-01-09 AC-9 to AC-14). It is the
only way to change the Super Admin when the holder cannot act; no route of the application does it. Nothing printed here
is a password or a link: the one-time link goes to a mailbox, and the person sets the password there.

Modes
  reset-credentials   The holder lost the password (and maybe the mailbox). Their old credential and every session and
                      link end, and one link is sent to the address below; the holder sets a new password with it.
      --account-email <login email of the holder>
      --new-login-email <address>      Optional. The link goes only to this address; the login email changes to it only
                                       after the link is opened. Refused if another account already uses it.
  unlock              The holder's account is locked and the holder still works. Opens it; changes no role.
      --account-email <login email of the holder>
  transfer-role       The holder cannot act (left, locked, or nobody holds the role): hand the role to another person.
                      First run: creates the successor's account (no role) and invites them. After they activate it,
                      run the same ticket again: the role moves in one step.
      --successor-code <employee code of the successor>
      --holder-email <login email of the current holder>   Required when somebody holds the role; leave out if nobody does.

Required for every mode
  --ticket <reference>        The approved ticket (for example R-2026-014). The same reference run again does nothing twice.
  --approved-by <reference>   Who approved it.
  --operator <reference>      Who runs this command. In SHARED, different from the approver and from the person who
                              receives the link.
  --environment <env>         LOCAL_TEST or SHARED (recorded in the audit trail).
Optional
  --identity-check <reference>  The reference of the identity check the approver did (recorded, never a secret).
  --help

Exit codes: 0 done · 2 nothing to do (the ticket was already completed, or a link is already on its way) · 1 refused or error.
A refusal changes nothing. Values must be real references, not placeholders.`;

const OPTIONS = {
  ticket: { type: 'string' },
  'approved-by': { type: 'string' },
  operator: { type: 'string' },
  environment: { type: 'string' },
  'identity-check': { type: 'string' },
  'account-email': { type: 'string' },
  'new-login-email': { type: 'string' },
  'successor-code': { type: 'string' },
  'holder-email': { type: 'string' },
  help: { type: 'boolean' },
} as const;

export type RecoveryCommand =
  | { mode: 'reset-credentials'; context: RecoveryContext; accountEmail: string; newLoginEmail?: string }
  | { mode: 'unlock'; context: RecoveryContext; accountEmail: string }
  | { mode: 'transfer-role'; context: RecoveryContext; successorEmployeeCode: string; holderEmail?: string };

export type ParsedRecoveryArguments = { help: true } | { help: false; command: RecoveryCommand };

/**
 * Turns argv into one command. A secret in an option is refused by name: the command takes no password, code or
 * link, and must not be taught to by accident.
 */
export function parseRecoveryArguments(argv: readonly string[]): ParsedRecoveryArguments {
  const secret = argv.find((arg) => /^--?(password|pass|pwd|secret|token|code|link)(=|$)/i.test(arg));
  if (secret) throw new RecoveryArgumentError('The command takes no password, code or link as an option.');

  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new RecoveryArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (parsed.values.help) return { help: true };

  const [mode, ...extra] = parsed.positionals;
  if (extra.length > 0) throw new RecoveryArgumentError(`Unexpected argument: ${extra[0]}`);
  if (mode !== 'reset-credentials' && mode !== 'unlock' && mode !== 'transfer-role') {
    throw new RecoveryArgumentError('Name the mode: reset-credentials, unlock or transfer-role.');
  }

  const text = (key: keyof typeof OPTIONS): string | undefined => {
    const value = parsed.values[key];

    return typeof value === 'string' ? value : undefined;
  };
  const required = (key: keyof typeof OPTIONS): string => {
    const value = text(key);
    if (value === undefined || value.trim() === '') throw new RecoveryArgumentError(`--${key} is required.`);

    return value.trim();
  };
  const environment = required('environment');
  if (environment !== 'LOCAL_TEST' && environment !== 'SHARED') {
    throw new RecoveryArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }
  const identityCheck = text('identity-check')?.trim();
  const context: RecoveryContext = {
    ticketRef: required('ticket'),
    approverRef: required('approved-by'),
    operatorRef: required('operator'),
    environment,
    ...(identityCheck ? { identityCheckRef: identityCheck } : {}),
  };
  const forbid = (...keys: (keyof typeof OPTIONS)[]) => {
    const given = keys.find((key) => text(key) !== undefined);
    if (given) throw new RecoveryArgumentError(`--${given} does not belong to ${mode}.`);
  };

  if (mode === 'reset-credentials') {
    forbid('successor-code', 'holder-email');
    const newLoginEmail = text('new-login-email')?.trim();

    return {
      help: false,
      command: {
        mode,
        context,
        accountEmail: required('account-email'),
        ...(newLoginEmail ? { newLoginEmail } : {}),
      },
    };
  }
  if (mode === 'unlock') {
    forbid('successor-code', 'holder-email', 'new-login-email');

    return { help: false, command: { mode, context, accountEmail: required('account-email') } };
  }
  forbid('account-email', 'new-login-email');
  const holderEmail = text('holder-email')?.trim();

  return {
    help: false,
    command: {
      mode,
      context,
      successorEmployeeCode: required('successor-code'),
      ...(holderEmail ? { holderEmail } : {}),
    },
  };
}
