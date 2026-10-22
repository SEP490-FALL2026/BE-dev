import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CurrencyRecord } from '../finance.types';

const CURRENCY_SELECT = { code: true, name: true, minorUnit: true } as const;

/** Read-only: `currencies` is reference data seeded by migration. */
@Injectable()
export class CurrencyRepo {
  constructor(private readonly prisma: PrismaService) {}

  list(tx?: DbTx): Promise<CurrencyRecord[]> {
    return (tx ?? this.prisma).currency.findMany({ select: CURRENCY_SELECT, orderBy: { code: 'asc' } });
  }

  find(code: string, tx?: DbTx): Promise<CurrencyRecord | null> {
    return (tx ?? this.prisma).currency.findUnique({ where: { code }, select: CURRENCY_SELECT });
  }
}
