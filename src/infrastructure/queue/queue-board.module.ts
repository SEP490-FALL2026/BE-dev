import { Module } from '@nestjs/common';
import { QueueBoardMount } from './queue-board.mount';

@Module({ providers: [QueueBoardMount] })
export class QueueBoardModule {}
