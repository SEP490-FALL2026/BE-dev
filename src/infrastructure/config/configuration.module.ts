import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { environmentConfigOptions } from './env-config';

@Module({
  imports: [ConfigModule.forRoot(environmentConfigOptions)],
})
export class ConfigurationModule {}
