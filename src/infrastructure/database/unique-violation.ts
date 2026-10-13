import { Prisma } from '../../generated/prisma/client';
import { readSqlState } from './transaction-runner';

/** True for a P2002 whose constraint or column list mentions one of `needles`. */
export function isUniqueViolation(error: unknown, ...needles: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const haystack = JSON.stringify(error.meta ?? {});

  return needles.some((needle) => haystack.includes(needle));
}

/** True when PostgreSQL rejected the statement with SQLSTATE 23514 (a CHECK or a trigger's own refusal). */
export function isCheckViolation(error: unknown): boolean {
  return readSqlState(error) === '23514';
}
