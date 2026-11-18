import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ChecklistJudgeService } from './checklist/checklist-judge.service';
import { ChecklistRecordService } from './checklist/checklist-record.service';
import { ChecklistRepo } from './checklist/checklist.repo';
import { PolicyChecklistApi } from './public/policy-checklist.api';

/**
 * The checklist of a decision (`QĐ-111ap`) for the modules that decide: no controller and nothing else of the library, so a module that only
 * judges and records answers does not load the routes of the policies.
 */
@Module({
  imports: [DatabaseModule],
  providers: [ChecklistRepo, ChecklistJudgeService, ChecklistRecordService, PolicyChecklistApi],
  exports: [PolicyChecklistApi],
})
export class PoliciesChecklistFacadeModule {}
