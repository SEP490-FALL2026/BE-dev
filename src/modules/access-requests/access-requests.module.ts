import { Module } from '@nestjs/common';
import { ApprovalPolicy } from './policies/approval.policy';

/**
 * Holds the approval invariants for access requests. The module exports nothing yet:
 * a root facade is added when the first controller needs orchestration, not before.
 */
@Module({
  providers: [ApprovalPolicy],
})
export class AccessRequestsModule {}
