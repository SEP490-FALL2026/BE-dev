import { Injectable } from '@nestjs/common';
import { BusinessDate, fromDateColumn, toDateColumn } from '../../core/business-date';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DbTx } from '../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../infrastructure/database/unique-violation';
import { ParameterValue } from './parameter-definitions';

export interface ParameterRow {
  key: string;
  value: ParameterValue;
  validFrom: Date;
  validTo: Date | null;
  changedBy: string | null;
}

export interface NonWorkingDateRow {
  date: BusinessDate;
  reason: string;
}

/** Owns ParameterValue (the history of every parameter) and NonWorkingDate (US-01-04). */
@Injectable()
export class OperatingParametersRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** One advisory lock per key's change, so two writers of the same key meet one after the other. */
  async lockKey(tx: DbTx, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`operating-parameter:${key}`}, 0))`;
  }

  async currentRows(client?: DbTx): Promise<ParameterRow[]> {
    const rows = await (client ?? this.prisma).parameterValue.findMany({
      where: { validTo: null },
      select: { key: true, value: true, validFrom: true, validTo: true, changedBy: true },
    });

    return rows.map((row) => ({ ...row, value: row.value as ParameterValue }));
  }

  async history(key: string, limit: number): Promise<ParameterRow[]> {
    const rows = await this.prisma.parameterValue.findMany({
      where: { key },
      select: { key: true, value: true, validFrom: true, validTo: true, changedBy: true },
      orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return rows.map((row) => ({ ...row, value: row.value as ParameterValue }));
  }

  async replaceCurrent(
    tx: DbTx,
    input: { organizationId: string; key: string; value: ParameterValue; changedBy: string | null; now: Date },
  ): Promise<void> {
    await tx.parameterValue.updateMany({ where: { key: input.key, validTo: null }, data: { validTo: input.now } });
    await tx.parameterValue.create({
      data: {
        organizationId: input.organizationId,
        key: input.key,
        value: input.value,
        validFrom: input.now,
        changedBy: input.changedBy,
      },
    });
  }

  // --- non-working dates ---------------------------------------------------------------

  async listNonWorkingDates(range: { from?: BusinessDate; to?: BusinessDate }): Promise<NonWorkingDateRow[]> {
    const rows = await this.prisma.nonWorkingDate.findMany({
      where: {
        ...(range.from || range.to
          ? {
              date: {
                ...(range.from ? { gte: toDateColumn(range.from) } : {}),
                ...(range.to ? { lte: toDateColumn(range.to) } : {}),
              },
            }
          : {}),
      },
      select: { date: true, reason: true },
      orderBy: { date: 'asc' },
    });

    return rows.map((row) => ({ date: fromDateColumn(row.date), reason: row.reason }));
  }

  /** Takes the row lock of one day and reads it. Null when the day is not a non-working date. */
  async lockNonWorkingDate(tx: DbTx, date: BusinessDate): Promise<NonWorkingDateRow | null> {
    const rows = await tx.$queryRaw<{ date: Date; reason: string }[]>`
      SELECT date, reason FROM non_working_dates WHERE date = ${date}::date FOR UPDATE`;

    return rows[0] ? { date: fromDateColumn(rows[0].date), reason: rows[0].reason } : null;
  }

  /** Returns false when the day is already one (the unique index decides, so two writers cannot both add it). */
  async insertNonWorkingDate(
    tx: DbTx,
    input: { organizationId: string; date: BusinessDate; reason: string; createdBy: string | null },
  ): Promise<boolean> {
    try {
      await tx.nonWorkingDate.create({
        data: {
          organizationId: input.organizationId,
          date: toDateColumn(input.date),
          reason: input.reason,
          createdBy: input.createdBy,
        },
      });

      return true;
    } catch (error) {
      if (isUniqueViolation(error, 'date')) return false;
      throw error;
    }
  }

  async updateNonWorkingDateReason(tx: DbTx, date: BusinessDate, reason: string): Promise<void> {
    await tx.nonWorkingDate.updateMany({ where: { date: toDateColumn(date) }, data: { reason } });
  }

  async deleteNonWorkingDate(tx: DbTx, date: BusinessDate): Promise<void> {
    await tx.nonWorkingDate.deleteMany({ where: { date: toDateColumn(date) } });
  }
}
