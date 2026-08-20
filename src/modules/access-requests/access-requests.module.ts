import { Module } from '@nestjs/common';
import { AccessRequestsService } from './access-requests.service';
import { ApprovalPolicy } from './policies/approval.policy';

@Module({
  providers: [ApprovalPolicy, AccessRequestsService],
  exports: [AccessRequestsService],
})
export class AccessRequestsModule {}
