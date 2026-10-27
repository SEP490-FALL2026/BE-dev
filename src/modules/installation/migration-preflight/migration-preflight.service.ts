import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { historyOf, judgeContractGates, judgeConversion, withContractGates } from './migration-preflight-judgement';
import { MigrationPreflightRepo } from './migration-preflight.repo';
import { PreflightHistory, PreflightReport } from './migration-preflight.types';

/**
 * `ops:preflight` (P28-01, `P29-MIGRATION=B-FORWARD`): judges, before `prisma migrate deploy`, whether the migration
 * history can carry this database to Units-only Cost Centers. It writes nothing, and cannot: its graph opens every
 * PostgreSQL session read-only (ReadOnlyDatabaseSessionModule). Every read runs in the one transaction of the command.
 */
@Injectable()
export class MigrationPreflightService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: MigrationPreflightRepo,
  ) {}

  private async conversion(tx: DbTx, history: PreflightHistory): Promise<PreflightReport> {
    switch (history) {
      case 'BEFORE_UNIT_ONLY':
      case 'UNIT_ONLY_FAILED':
        return judgeConversion(history, await this.repo.legacyFacts(tx));
      case 'UNIT_ONLY_APPLIED':
      case 'FORWARD_FAILED':
        return judgeConversion(history, await this.repo.convertedFacts(tx));
      default:
        return judgeConversion(history, {
          serviceAccounts: [],
          companyAllocations: [],
          companyDepartments: [],
          companyCostCenters: [],
        });
    }
  }

  async judge(): Promise<PreflightReport> {
    return this.runner.run(async (tx) => {
      const history = historyOf(await this.repo.migrationRecords(tx));
      const conversion = await this.conversion(tx, history);
      // The gates read the schema as it is, whatever the history: they probe before they name an object (spec L.10).
      const gates = judgeContractGates(await this.repo.contractGateFacts(tx));

      return withContractGates(conversion, gates);
    });
  }
}
