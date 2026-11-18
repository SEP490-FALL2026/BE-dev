import { Module } from '@nestjs/common';
import { AiAssistModule } from './ai-assist.module';
import { InvocationContentController } from './invocation-content/invocation-content.controller';
import { QueueSummaryController } from './queue-summary/queue-summary.controller';

/**
 * The routes of the AI summary of the approval queue, mounted by the API only. A module of its own, not part of `AiAssistModule`,
 * so a process that has no routes (the worker, a command) never carries a controller with it. It reads the summary through the one
 * `QueueSummaryService` that `AiAssistModule` holds, and the content of a call (Super Admin only) through its
 * `InvocationContentQueryService`.
 */
@Module({
  imports: [AiAssistModule],
  controllers: [QueueSummaryController, InvocationContentController],
})
export class AiAssistHttpModule {}
