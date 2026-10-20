import { Prisma } from '../../generated/prisma/client';
import { readSqlState } from './transaction-runner';

/** True for a P2002 whose constraint or column list mentions one of `needles`. */
export function isUniqueViolation(error: unknown, ...needles: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const haystack = JSON.stringify(error.meta ?? {});

  return needles.some((needle) => haystack.includes(needle));
}

/**
 * True when PostgreSQL rejected the statement with SQLSTATE 23514 (a CHECK or a trigger's own refusal); with `needles`,
 * only when the error also names one of them (the constraint a trigger raised with).
 */
export function isCheckViolation(error: unknown, ...needles: string[]): boolean {
  if (readSqlState(error) !== '23514') return false;
  if (needles.length === 0) return true;
  const haystack = JSON.stringify((error as Prisma.PrismaClientKnownRequestError).meta ?? {});

  return needles.some((needle) => haystack.includes(needle));
}
